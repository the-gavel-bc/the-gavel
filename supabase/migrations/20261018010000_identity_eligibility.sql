-- Match the server identity boundary on direct Data API operations. Read
-- authoritative Auth fields rather than caller-editable user metadata.
create function private.has_eligible_identity()
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
      and (
        u.raw_app_meta_data ->> 'provider' = 'google'
        or u.raw_app_meta_data -> 'providers' ? 'google'
      )
  );
$$;
revoke all on function private.has_eligible_identity() from public, anon;
grant execute on function private.has_eligible_identity() to authenticated;

create or replace function private.is_active_administrator(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select check_user_id = auth.uid()
    and private.has_eligible_identity()
    and exists (
      select 1 from public.memberships
      where user_id = check_user_id and active and role = 'administrator'
    );
$$;

drop policy profiles_owner_or_admin_update on public.profiles;
create policy profiles_owner_or_admin_update
on public.profiles for update to authenticated
using (
  private.has_eligible_identity() and (
    (auth_user_id = auth.uid() and exists (
      select 1 from public.memberships where user_id = auth.uid() and active
    )) or private.is_active_administrator()
  )
)
with check (
  private.has_eligible_identity() and (
    (auth_user_id = auth.uid() and exists (
      select 1 from public.memberships where user_id = auth.uid() and active
    )) or private.is_active_administrator()
  )
);

create or replace function public.current_profile()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.profiles p
  join public.memberships m on m.user_id = p.auth_user_id
  where p.auth_user_id = auth.uid() and p.active and m.active
    and private.has_eligible_identity();
$$;
