-- Return only the caller's public profile fields without granting access to
-- auth_user_id on every public profile. No caller-supplied user ID is accepted.
create function public.current_profile()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.profiles p
  join public.memberships m on m.user_id = p.auth_user_id
  where p.auth_user_id = auth.uid() and p.active and m.active;
$$;
revoke all on function public.current_profile() from public, anon;
grant execute on function public.current_profile() to authenticated;
