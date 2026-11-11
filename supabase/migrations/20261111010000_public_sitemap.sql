-- Shared sitemap page budget, separate from search. 512 slots encode a server
-- minute and at most 300 accepted page reads across all callers. Sequence
-- changes deliberately survive rollback/cancellation; no row is written.
-- ponytail: one global budget; a busy caller can starve crawlers for a minute.
create sequence private.public_sitemap_budget as bigint minvalue 0 start with 0 increment by 1 cache 1 no cycle;
create function private.claim_public_sitemap_budget() returns integer
language plpgsql volatile set search_path='' as $$
declare base bigint; used bigint; now_at timestamptz;
begin
  -- Same two-int advisory namespace as search, with its own key.
  perform pg_catalog.pg_advisory_xact_lock(1617,2);
  now_at:=clock_timestamp();
  base:=floor(extract(epoch from now_at)/60)::bigint*512;
  select last_value into used from private.public_sitemap_budget;
  if used<base then perform pg_catalog.setval('private.public_sitemap_budget'::regclass,base,true); used:=base; end if;
  if used>=base+300 then
    return greatest(1,least(60,ceil(extract(epoch from(to_timestamp((used/512+1)*60)-now_at)))))::integer;
  end if;
  perform pg_catalog.nextval('private.public_sitemap_budget'::regclass);
  return 0;
end;
$$;
revoke all on sequence private.public_sitemap_budget from public,anon,authenticated,service_role;
revoke all on function private.claim_public_sitemap_budget() from public,anon,authenticated,service_role;

-- Identifiers only. Visibility mirrors list_public_articles plus a non-NULL
-- body, since legacy NULL bodies render unavailable/noindex. Writes validate
-- non-null bodies, so a full document check is not repeated per row. Each row
-- carries its own archive slugs so callers derive archives from listed
-- articles; no listed archive can be empty within one response.
create or replace function public.list_public_sitemap_articles(
  p_after_published_at timestamptz, p_after_id uuid, p_limit integer
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  retry integer;
  result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 1000
    or (p_after_published_at is null) <> (p_after_id is null) then
    return jsonb_build_object('kind','invalid');
  end if;
  retry:=private.claim_public_sitemap_budget();
  if retry>0 then return jsonb_build_object('kind','rate_limited','retryAfter',retry); end if;

  with candidates as materialized (
    select a.id,a.slug,a.published_at,a.section_id,s.slug section_slug,p.slug owner_slug
    from public.articles a
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles p on p.id=a.owner_profile_id and p.active
    where a.status='published' and a.content is not null
      and (p_after_id is null or (a.published_at,a.id)<(p_after_published_at,p_after_id))
    order by a.published_at desc,a.id desc
    limit p_limit+1
  ), page as materialized (
    select * from candidates order by published_at desc,id desc limit p_limit
  )
  select jsonb_build_object(
    'kind','ok',
    'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',pg.id,'slug',pg.slug,
        'publishedAt',to_char(pg.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'section',pg.section_slug,
        'categories',(select coalesce(jsonb_agg(x.slug order by x.slug),'[]'::jsonb) from (
          select c.slug from public.article_categories ac
          join public.categories c on c.id=ac.category_id and c.active and c.section_id=pg.section_id
          where ac.article_id=pg.id order by c.slug limit 65) x),
        'tags',(select coalesce(jsonb_agg(x.slug order by x.slug),'[]'::jsonb) from (
          select t.slug from public.article_tags atg join public.tags t on t.id=atg.tag_id
          where atg.article_id=pg.id order by t.slug limit 65) x),
        'authors',(select coalesce(jsonb_agg(x.slug order by x.slug),'[]'::jsonb) from (
          select pg.owner_slug slug
          union
          select cp.slug from public.article_contributors ac
          join public.profiles cp on cp.id=ac.profile_id and cp.active
          where ac.article_id=pg.id
          order by 1 limit 65) x))
      order by pg.published_at desc,pg.id desc) from page pg),'[]'::jsonb),
    'hasMore',(select count(*) from candidates)>p_limit)
  into result;
  return result;
end;
$$;

revoke all on function public.list_public_sitemap_articles(timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_public_sitemap_articles(timestamptz,uuid,integer) to anon,authenticated;
