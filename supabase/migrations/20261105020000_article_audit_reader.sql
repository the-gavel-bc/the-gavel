-- A bounded article-only summary. Raw Auth IDs and correlation IDs are not returned.
create index audit_events_recent_article_idx
on public.audit_events (created_at desc, id desc)
where resource_type = 'article';

create function public.list_article_audit_events(
  p_limit integer default 20,
  p_action text default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  event_id uuid,
  action text,
  resource_id uuid,
  created_at timestamptz,
  actor_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_administrator() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  -- One extra row lets the server determine whether another page exists.
  if p_limit is null or p_limit < 1 or p_limit > 51
    or (p_action is not null and p_action not in (
      'article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored'
    ))
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid audit request.' using errcode = '22023';
  end if;

  return query
  select e.id, e.action, e.resource_id, e.created_at,
    coalesce(p.display_name, 'Former member')::text
  from public.audit_events e
  left join public.profiles p on p.auth_user_id = e.actor_user_id
  where e.resource_type = 'article'
    and e.action in ('article.created', 'article.updated', 'article.published',
      'article.archived', 'article.restored')
    and (p_action is null or e.action = p_action)
    and (p_before_at is null or (e.created_at, e.id) < (p_before_at, p_before_id))
  order by e.created_at desc, e.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_article_audit_events(integer,text,timestamptz,uuid)
from public, anon, authenticated;
grant execute on function public.list_article_audit_events(integer,text,timestamptz,uuid)
to authenticated;
