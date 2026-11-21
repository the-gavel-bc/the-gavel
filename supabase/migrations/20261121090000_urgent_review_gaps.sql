-- Keep publication dates in the supported editorial range in SQL and TypeScript.
create or replace function private.publication_date_allowed(p_date date)
returns boolean language sql stable set search_path = '' as $$
  select p_date is null
    or (p_date >= date '2000-01-01'
      and p_date <= (pg_catalog.now() at time zone 'America/New_York')::date);
$$;

-- Include ownership events in the administrator's existing audit reader.
CREATE OR REPLACE FUNCTION public.list_article_audit_events(p_limit integer DEFAULT 20, p_action text DEFAULT NULL::text, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(event_id uuid, action text, resource_id uuid, created_at timestamp with time zone, actor_label text, article_exists boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pattern text;
  allowed_actions constant text[] := array[
      'article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored', 'article.deleted', 'article.owner_changed',
      'article.submitted', 'article.returned', 'article.image_purged'
  ];
begin
  if not private.is_active_administrator() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51
    or (p_action is not null and not (p_action = any(allowed_actions)))
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
    and e.action = any(allowed_actions)
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
$function$;
