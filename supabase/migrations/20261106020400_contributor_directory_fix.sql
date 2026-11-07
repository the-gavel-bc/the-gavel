create or replace function public.list_admin_contributors(
  p_limit integer default 21,p_state text default 'all',
  p_before_slug text default null,p_before_id uuid default null
) returns table (
  profile_id uuid,display_name text,slug text,biography text,active boolean,
  edit_version integer,slug_frozen boolean,linked_account boolean,referenced_live boolean
) language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles caller_profile
      where caller_profile.auth_user_id=auth.uid() and caller_profile.active
  ) then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 51
    or p_state is null or p_state not in ('all','active','inactive')
    or ((p_before_slug is null)<>(p_before_id is null))
    or (p_before_slug is not null and (
      pg_catalog.char_length(p_before_slug)>180
      or p_before_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) then
    raise exception 'Invalid contributor list request.' using errcode='22023';
  end if;
  return query
  select p.id,p.display_name,p.slug,p.biography,p.active,p.edit_version,
    p.slug_frozen,p.auth_user_id is not null,
    (exists(select 1 from public.articles a where a.owner_profile_id=p.id
      and a.status in ('published','archived'))
      or exists(select 1 from public.article_contributors c
        join public.articles a on a.id=c.article_id
        where c.profile_id=p.id and a.status in ('published','archived')))
  from public.profiles p
  where (p_state='all' or (p_state='active' and p.active)
    or (p_state='inactive' and not p.active))
    and (p_before_slug is null or (p.slug collate "C",p.id)>(p_before_slug collate "C",p_before_id))
  order by p.slug collate "C",p.id
  limit p_limit;
end;
$$;
revoke all on function public.list_admin_contributors(integer,text,text,uuid)
from public,anon,authenticated;
grant execute on function public.list_admin_contributors(integer,text,text,uuid)
to authenticated;
