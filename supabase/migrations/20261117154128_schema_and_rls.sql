-- Formsmith: tables, constraints, triggers, grants and Row Level Security.
--
-- Security model (see docs/PLAN.md §5):
--  * RLS is enabled on every table.
--  * Column-level GRANTs complement RLS: RLS decides WHICH ROWS a user may touch,
--    grants decide WHICH COLUMNS. Respondents can never write responses.status /
--    submitted_at, and nobody can read resume_token_hash, through the API.
--  * Anything privileged (publishing, quota, resume claims, public reads) goes through
--    narrow SECURITY DEFINER functions in the next migration.
--  * Owners are permanent users: anonymous users (is_anonymous JWT claim) can't own forms.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.is_permanent_user()
returns boolean
language sql stable
set search_path = ''
as $$
  select auth.uid() is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- forms
-- ---------------------------------------------------------------------------

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  title text not null check (char_length(title) between 1 and 120),
  draft_schema jsonb not null check (jsonb_typeof(draft_schema) = 'object' and pg_column_size(draft_schema) < 262144),
  published_version_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The demo form has no owner; every other form must have one.
  constraint forms_owner_or_demo check ((owner_id is null) = is_demo)
);
create index forms_owner_id_idx on public.forms (owner_id);

create trigger forms_set_updated_at
before update on public.forms
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- form_versions (immutable snapshots)
-- ---------------------------------------------------------------------------

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms (id) on delete cascade,
  version int not null check (version > 0),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  published_at timestamptz not null default now(),
  unique (form_id, version)
);

alter table public.forms
  add constraint forms_published_version_fk
  foreign key (published_version_id) references public.form_versions (id) on delete set null;

create or replace function private.reject_version_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'form_versions are immutable' using errcode = 'check_violation';
end;
$$;

create trigger form_versions_immutable
before update on public.form_versions
for each row execute function private.reject_version_update();

-- A form may only point at one of its own versions.
create or replace function private.check_published_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.published_version_id is not null and not exists (
    select 1 from public.form_versions v
    where v.id = new.published_version_id and v.form_id = new.id
  ) then
    raise exception 'published_version_id must belong to this form' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger forms_check_published_version
before insert or update of published_version_id on public.forms
for each row execute function private.check_published_version();

-- ---------------------------------------------------------------------------
-- responses
-- ---------------------------------------------------------------------------

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  -- Denormalised from the version (set by trigger) so owner RLS is one indexed join
  -- and analytics can span versions.
  form_id uuid not null references public.forms (id) on delete cascade,
  version_id uuid not null references public.form_versions (id) on delete cascade,
  -- Nullable + SET NULL: cleaning up old anonymous users must not delete submitted responses.
  respondent_id uuid default auth.uid() references auth.users (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 131072),
  last_step_id text check (char_length(last_step_id) <= 64),
  -- Furthest step index reached on the respondent's visible path (drives the drop-off funnel).
  furthest_step_index int not null default 0 check (furthest_step_index between 0 and 100),
  -- SHA-256 of the resume token; the plaintext is shown to the respondent once and never stored.
  resume_token_hash bytea unique,
  resume_token_expires_at timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint responses_submitted_at check ((status = 'submitted') = (submitted_at is not null))
);
create index responses_form_status_idx on public.responses (form_id, status);
create index responses_version_idx on public.responses (version_id);
create index responses_respondent_idx on public.responses (respondent_id);
-- One open draft per respondent per version.
create unique index responses_one_draft_idx on public.responses (version_id, respondent_id) where status = 'draft';

create trigger responses_set_updated_at
before update on public.responses
for each row execute function private.set_updated_at();

-- Fill form_id from the version and force a clean draft on insert. SECURITY DEFINER because
-- respondents can't read form_versions directly.
create or replace function private.responses_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select v.form_id into new.form_id from public.form_versions v where v.id = new.version_id;
  if new.form_id is null then
    raise exception 'unknown version' using errcode = 'foreign_key_violation';
  end if;
  new.status := 'draft';
  new.submitted_at := null;
  new.resume_token_hash := null;
  new.resume_token_expires_at := null;
  return new;
end;
$$;

create trigger responses_before_insert
before insert on public.responses
for each row execute function private.responses_before_insert();

-- True if the version is the CURRENT published version of its form. Respondents can only
-- start responses on the live version (they may keep finishing an older draft).
create or replace function private.is_live_version(p_version_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.forms f where f.published_version_id = p_version_id
  )
$$;

-- True if the caller owns the form (permanent users only).
create or replace function private.owns_form(p_form_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select private.is_permanent_user() and exists (
    select 1 from public.forms f where f.id = p_form_id and f.owner_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- ai_requests (quota ledger; no content, no personal data)
-- ---------------------------------------------------------------------------

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  is_anonymous boolean not null,
  kind text not null check (kind in ('generate', 'edit')),
  model text check (char_length(model) <= 80),
  latency_ms int check (latency_ms >= 0),
  valid boolean,
  created_at timestamptz not null default now()
);
create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);
create index ai_requests_created_idx on public.ai_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then allow exactly what the app needs.
-- (service_role keeps its defaults; it's used only by the submit handler.)
-- ---------------------------------------------------------------------------

revoke all on public.forms, public.form_versions, public.responses, public.ai_requests from anon, authenticated;

grant select, delete on public.forms to authenticated;
grant insert (slug, title, draft_schema) on public.forms to authenticated;
grant update (slug, title, draft_schema) on public.forms to authenticated;

grant select on public.form_versions to authenticated;

-- Every column except the resume token hash/expiry. NB: clients must list columns
-- explicitly; `select *` fails with a permission error by design.
grant select (id, form_id, version_id, respondent_id, status, answers, last_step_id, furthest_step_index, started_at, updated_at, submitted_at)
  on public.responses to authenticated;
grant insert (version_id, answers, last_step_id, furthest_step_index) on public.responses to authenticated;
grant update (answers, last_step_id, furthest_step_index) on public.responses to authenticated;

grant select on public.ai_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
alter table public.responses enable row level security;
alter table public.ai_requests enable row level security;

-- forms: owners only (permanent users). The demo form is read through functions.
create policy "Owners read their forms" on public.forms
  for select to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_permanent_user()));

create policy "Permanent users create their own forms" on public.forms
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.is_permanent_user()) and is_demo = false);

create policy "Owners update their forms" on public.forms
  for update to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_permanent_user()))
  with check (owner_id = (select auth.uid()));

create policy "Owners delete their forms" on public.forms
  for delete to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_permanent_user()));

-- form_versions: owners read their own; nobody writes directly (publish_form does).
create policy "Owners read their versions" on public.form_versions
  for select to authenticated
  using ((select private.owns_form(form_id)));

-- responses
create policy "Owners read responses to their forms" on public.responses
  for select to authenticated
  using ((select private.owns_form(form_id)));

create policy "Respondents read their own responses" on public.responses
  for select to authenticated
  using (respondent_id = (select auth.uid()));

create policy "Respondents start a draft on a live form" on public.responses
  for insert to authenticated
  with check (
    respondent_id = (select auth.uid())
    and status = 'draft'
    and private.is_live_version(version_id)
  );

create policy "Respondents update their own draft" on public.responses
  for update to authenticated
  using (respondent_id = (select auth.uid()) and status = 'draft')
  with check (respondent_id = (select auth.uid()) and status = 'draft');

-- ai_requests: read own rows (for "2 of 3 AI calls left"); writes only via functions.
create policy "Users read their own AI requests" on public.ai_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Helper functions are internal.
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_permanent_user(), private.is_live_version(uuid), private.owns_form(uuid) to authenticated;
