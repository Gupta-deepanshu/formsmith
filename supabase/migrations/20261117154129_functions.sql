-- Narrow SECURITY DEFINER functions: each does its own authorisation check, touches only
-- what it must, and pins search_path = '' so object names can't be hijacked.
-- (pgcrypto provides gen_random_bytes and digest; enabled by default on Supabase.)
create extension if not exists pgcrypto with schema extensions;

-- These replace a custom backend: the app calls them with the user's own session,
-- no secret key involved.

-- ---------------------------------------------------------------------------
-- open_public_form: everything the respondent page needs, in one call.
-- Returns the published version, or, if the caller already has a draft on an older
-- version of this form, that version, so a re-publish never breaks a half-filled form.
-- ---------------------------------------------------------------------------
create or replace function public.open_public_form(p_slug text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  f public.forms%rowtype;
  d public.responses%rowtype;
  v public.form_versions%rowtype;
begin
  select * into f from public.forms where slug = p_slug and published_version_id is not null;
  if not found then
    return null;
  end if;

  if auth.uid() is not null then
    select * into d from public.responses
    where form_id = f.id and respondent_id = auth.uid() and status = 'draft'
    order by updated_at desc limit 1;
  end if;

  select * into v from public.form_versions
  where id = coalesce(d.version_id, f.published_version_id);

  return jsonb_build_object(
    'formId', f.id,
    'slug', f.slug,
    'isDemo', f.is_demo,
    'versionId', v.id,
    'version', v.version,
    'schema', v.schema,
    'draft', case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'answers', d.answers,
      'lastStepId', d.last_step_id,
      'furthestStepIndex', d.furthest_step_index,
      'updatedAt', d.updated_at
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- publish_form: snapshot draft_schema into the next immutable version.
-- ---------------------------------------------------------------------------
create or replace function public.publish_form(p_form_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms%rowtype;
  next_version int;
  new_id uuid;
begin
  if not private.is_permanent_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Row lock: two concurrent publishes can't both take the same version number.
  select * into f from public.forms where id = p_form_id and owner_id = auth.uid() for update;
  if not found then
    raise exception 'form not found' using errcode = 'P0002';
  end if;
  if f.draft_schema ->> 'schemaVersion' is null then
    raise exception 'draft is not a form definition' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from public.form_versions where form_id = f.id;
  insert into public.form_versions (form_id, version, schema)
  values (f.id, next_version, f.draft_schema)
  returning id into new_id;

  update public.forms set published_version_id = new_id where id = f.id;
  return jsonb_build_object('versionId', new_id, 'version', next_version, 'slug', f.slug);
end;
$$;

create or replace function public.unpublish_form(p_form_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_permanent_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.forms set published_version_id = null where id = p_form_id and owner_id = auth.uid();
  if not found then
    raise exception 'form not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resume tokens: 32 random bytes, returned once; only SHA-256 is stored; 30-day expiry.
-- ---------------------------------------------------------------------------
create or replace function public.issue_resume_token(p_response_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- base64url without padding: URL-safe and 43 characters long.
  token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  update public.responses
  set resume_token_hash = extensions.digest(token, 'sha256'),
      resume_token_expires_at = now() + interval '30 days'
  where id = p_response_id and respondent_id = auth.uid() and status = 'draft';
  if not found then
    raise exception 'draft not found' using errcode = 'P0002';
  end if;
  return token;
end;
$$;

-- Moves the draft to the caller's session (single device) and burns the token (single use).
create or replace function public.claim_response(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.responses%rowtype;
  form_slug text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) < 40 or char_length(p_token) > 64 then
    return null;
  end if;

  select * into r from public.responses
  where resume_token_hash = extensions.digest(p_token, 'sha256')
    and resume_token_expires_at > now()
    and status = 'draft'
  for update;
  if not found then
    return null;
  end if;

  if r.respondent_id is distinct from auth.uid() then
    -- The claimer may already have their own draft on this version; the claimed one wins.
    delete from public.responses
    where respondent_id = auth.uid() and status = 'draft' and version_id = r.version_id and id <> r.id;
  end if;

  update public.responses
  set respondent_id = auth.uid(), resume_token_hash = null, resume_token_expires_at = null
  where id = r.id;

  select slug into form_slug from public.forms where id = r.form_id;
  return jsonb_build_object('responseId', r.id, 'slug', form_slug);
end;
$$;

-- ---------------------------------------------------------------------------
-- AI quota: atomic check-and-record. Durable across serverless instances.
--   owners:    20 / hour, 60 / day
--   anonymous: 3 total (sandbox editor)
--   global:    400 / day across everyone (protects the free Gemini tier)
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  used_hour int;
  used_day int;
  used_total int;
  global_day int;
  oldest_in_hour timestamptz;
  new_id uuid;
  limit_hour constant int := 20;
  limit_day constant int := 60;
  limit_anon constant int := 3;
  limit_global constant int := 400;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_kind not in ('generate', 'edit') then
    raise exception 'bad kind' using errcode = '22023';
  end if;

  -- Serialise per user so parallel requests can't both pass the check.
  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || uid::text, 0));

  select count(*) into global_day from public.ai_requests where created_at > now() - interval '1 day';
  if global_day >= limit_global then
    return jsonb_build_object('allowed', false, 'reason', 'global', 'retryAfterSeconds', 3600);
  end if;

  if anon then
    select count(*) into used_total from public.ai_requests where user_id = uid;
    if used_total >= limit_anon then
      return jsonb_build_object('allowed', false, 'reason', 'anonymous_limit', 'remaining', 0);
    end if;
    insert into public.ai_requests (user_id, is_anonymous, kind) values (uid, true, p_kind) returning id into new_id;
    return jsonb_build_object('allowed', true, 'requestId', new_id, 'remaining', limit_anon - used_total - 1);
  end if;

  select count(*), min(created_at) into used_hour, oldest_in_hour
  from public.ai_requests where user_id = uid and created_at > now() - interval '1 hour';
  select count(*) into used_day from public.ai_requests where user_id = uid and created_at > now() - interval '1 day';

  if used_hour >= limit_hour then
    return jsonb_build_object('allowed', false, 'reason', 'hourly_limit',
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (oldest_in_hour + interval '1 hour' - now())))::int));
  end if;
  if used_day >= limit_day then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'retryAfterSeconds', 3600);
  end if;

  insert into public.ai_requests (user_id, is_anonymous, kind) values (uid, false, p_kind) returning id into new_id;
  return jsonb_build_object('allowed', true, 'requestId', new_id, 'remaining', least(limit_hour - used_hour, limit_day - used_day) - 1);
end;
$$;

-- Record outcome metadata (never content).
create or replace function public.finish_ai_request(p_request_id uuid, p_latency_ms int, p_valid boolean, p_model text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_requests
  set latency_ms = greatest(0, p_latency_ms), valid = p_valid, model = left(p_model, 80)
  where id = p_request_id and user_id = auth.uid() and latency_ms is null;
$$;

-- ---------------------------------------------------------------------------
-- Demo analytics: anonymised rows for the public demo page.
-- Only choice-type answers (option ids, ratings, yes/no) are returned, never free text,
-- so strangers' personal data (names, emails) is never exposed.
-- ---------------------------------------------------------------------------
create or replace function public.get_demo_responses()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with demo as (
    select f.id, f.published_version_id from public.forms f where f.is_demo and f.published_version_id is not null limit 1
  ),
  choice_fields as (
    select fld ->> 'id' as id
    from demo
    join public.form_versions v on v.id = demo.published_version_id
    cross join lateral jsonb_array_elements(v.schema -> 'steps') st
    cross join lateral jsonb_array_elements(st -> 'fields') fld
    where fld ->> 'type' in ('singleChoice', 'multipleChoice', 'dropdown', 'rating', 'yesNo')
  ),
  demo_rows as (
    -- No ids or timestamps, so a row can't be tied to a person by when they answered.
    select r.status, r.furthest_step_index,
      coalesce((
        select jsonb_object_agg(cf.id, r.answers -> cf.id)
        from choice_fields cf where r.answers ? cf.id
      ), '{}'::jsonb) as answers
    from public.responses r
    join demo on r.version_id = demo.published_version_id
    order by r.started_at desc
    limit 2000
  )
  select jsonb_build_object(
    'versionId', (select published_version_id from demo),
    'schema', (select v.schema from public.form_versions v join demo on v.id = demo.published_version_id),
    'responses', coalesce((select jsonb_agg(to_jsonb(demo_rows) order by random()) from demo_rows), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Execute permissions
-- ---------------------------------------------------------------------------
revoke all on function
  public.open_public_form(text),
  public.publish_form(uuid),
  public.unpublish_form(uuid),
  public.issue_resume_token(uuid),
  public.claim_response(text),
  public.consume_ai_quota(text),
  public.finish_ai_request(uuid, int, boolean, text),
  public.get_demo_responses()
from public, anon, authenticated;

grant execute on function public.open_public_form(text) to anon, authenticated;
grant execute on function public.get_demo_responses() to anon, authenticated;
grant execute on function
  public.publish_form(uuid),
  public.unpublish_form(uuid),
  public.issue_resume_token(uuid),
  public.claim_response(text),
  public.consume_ai_quota(text),
  public.finish_ai_request(uuid, int, boolean, text)
to authenticated;
