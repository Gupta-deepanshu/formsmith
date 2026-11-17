-- Submitted-response counts for the owner's forms list.
--
-- Why a function: PostgREST's embedded aggregate `responses(count)` needs table-level SELECT
-- on responses, but clients only get column-level SELECT (so resume_token_hash stays
-- unreadable). Granting table-level SELECT would expose the hash; this function doesn't.
--
-- SECURITY INVOKER (the default, stated explicitly): it runs as the caller, so RLS and the
-- column grants still apply. It reads only form_id and status, both granted columns.
create or replace function public.my_form_response_counts()
returns table (form_id uuid, submitted bigint)
language sql stable
security invoker
set search_path = ''
as $$
  select r.form_id, count(*)
  from public.responses r
  where r.status = 'submitted'
    and private.owns_form(r.form_id)  -- owner's forms only, not forms they responded to
  group by r.form_id
$$;

revoke all on function public.my_form_response_counts() from public, anon, authenticated;
grant execute on function public.my_form_response_counts() to authenticated;
