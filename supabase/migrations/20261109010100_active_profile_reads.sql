-- Profile deactivation must close direct Data API and Storage reads as well as dashboard access.
create or replace function private.is_active_administrator(check_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select check_user_id=auth.uid() and private.has_eligible_identity()
    and exists(select 1 from public.memberships m
      join public.profiles p on p.auth_user_id=m.user_id and p.active
      where m.user_id=check_user_id and m.active and m.role='administrator');
$$;

create or replace function private.can_read_article(check_article_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.has_eligible_identity()
    and exists(select 1 from public.memberships m
      join public.profiles caller on caller.auth_user_id=m.user_id and caller.active
      where m.user_id=auth.uid() and m.active)
    and exists(select 1 from public.articles a
      join public.profiles p on p.id=a.owner_profile_id
      where a.id=check_article_id
        and (p.auth_user_id=auth.uid() or private.is_active_administrator()));
$$;
