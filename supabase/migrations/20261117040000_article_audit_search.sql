-- Article activity search: a single term matches the article's title, the
-- actor's public name, or the event date (Eastern time, in a few spellings
-- such as 2026-11-13, November 13, 2026, Nov 13 2026 or 11/13/2026).
drop function public.list_article_audit_events(integer,text,timestamptz,uuid);
create function public.list_article_audit_events(
  p_limit integer default 20,
  p_action text default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_search text default null
)
returns table (
  event_id uuid, action text, resource_id uuid, created_at timestamptz,
  actor_label text, article_exists boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare pattern text;
begin
  if not private.is_active_administrator() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51
    or (p_action is not null and p_action not in (
      'article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored', 'article.deleted'
    ))
    or (p_search is not null and pg_catalog.char_length(p_search) > 80)
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid audit request.' using errcode = '22023';
  end if;
  pattern := case when pg_catalog.btrim(coalesce(p_search,'')) = '' then null
    else '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
      pg_catalog.btrim(p_search),'\','\\'),'%','\%'),'_','\_') || '%' end;

  return query
  select e.id, e.action, e.resource_id, e.created_at,
    coalesce(p.display_name, 'Former member')::text,
    exists(select 1 from public.articles a where a.id=e.resource_id)
  from public.audit_events e
  left join public.profiles p on p.auth_user_id = e.actor_user_id
  where e.resource_type = 'article'
    and e.action in ('article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored', 'article.deleted')
    and (p_action is null or e.action = p_action)
    and (pattern is null
      or p.display_name ilike pattern escape '\'
      or exists(select 1 from public.articles a
        where a.id = e.resource_id and a.title ilike pattern escape '\')
      or (pg_catalog.to_char(e.created_at at time zone 'America/New_York','YYYY-MM-DD')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMonth FMDD, YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMonth FMDD YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','Mon FMDD, YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','Mon FMDD YYYY')
        || ' ' || pg_catalog.to_char(e.created_at at time zone 'America/New_York','FMMM/FMDD/YYYY'))
        ilike pattern escape '\')
    and (p_before_at is null or (e.created_at, e.id) < (p_before_at, p_before_id))
  order by e.created_at desc, e.id desc
  limit p_limit;
end;
$$;
revoke all on function public.list_article_audit_events(integer,text,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.list_article_audit_events(integer,text,timestamptz,uuid,text) to authenticated;
