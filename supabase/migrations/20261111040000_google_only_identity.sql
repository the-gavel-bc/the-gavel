-- Email signup with automatic identity linking lets someone pre-register a
-- bc.edu address and later share the real owner's Google sign-in. GoTrue keeps
-- app metadata `providers` in sync with linked identities and callers cannot
-- edit it, so eligibility now requires Google to be the only provider.
-- ponytail: inline copies of the old check in membership/profile counting and
-- media finalization still accept mixed providers; those paths are gated by
-- this function or by access checks before they matter.
create or replace function private.has_eligible_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
      and u.raw_app_meta_data ->> 'provider' = 'google'
      and (
        not (u.raw_app_meta_data ? 'providers')
        or (jsonb_typeof(u.raw_app_meta_data -> 'providers') = 'array'
          and u.raw_app_meta_data -> 'providers' <@ '["google"]'::jsonb)
      )
  );
$$;
revoke all on function private.has_eligible_identity() from public, anon;
grant execute on function private.has_eligible_identity() to authenticated;
