create function public.list_admin_taxonomy(p_kind text,p_limit integer default 21,p_after_id uuid default null)
returns table(id uuid,name text,slug text,parent_name text,navigation_order integer,
  active boolean,edit_version integer,referenced_live boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_active_administrator() or not exists(
    select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active
  ) then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('section','category','tag')
    or p_limit is null or p_limit not between 1 and 51 then
    raise exception 'Invalid taxonomy request.' using errcode='22023'; end if;
  if p_kind='section' then
    return query select s.id,s.name,s.slug,null::text,s.navigation_order,s.active,s.edit_version,
      exists(select 1 from public.articles a where a.section_id=s.id and a.status in ('published','archived'))
      from public.sections s where p_after_id is null or s.id>p_after_id order by s.id limit p_limit;
  elsif p_kind='category' then
    return query select c.id,c.name,c.slug,s.name,c.navigation_order,c.active,c.edit_version,
      exists(select 1 from public.article_categories ac join public.articles a on a.id=ac.article_id
        where ac.category_id=c.id and a.status in ('published','archived'))
      from public.categories c join public.sections s on s.id=c.section_id
      where p_after_id is null or c.id>p_after_id order by c.id limit p_limit;
  else
    return query select t.id,t.name,t.slug,null::text,null::integer,null::boolean,null::integer,false
      from public.tags t where p_after_id is null or t.id>p_after_id order by t.id limit p_limit;
  end if;
end;
$$;
revoke all on function public.list_admin_taxonomy(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.list_admin_taxonomy(text,integer,uuid) to authenticated;
