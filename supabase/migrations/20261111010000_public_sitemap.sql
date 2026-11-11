-- Sitemap projections return identifiers only. Visibility mirrors
-- list_public_articles: published, active section and active owner profile.
create or replace function public.list_public_sitemap_articles(
  p_after_published_at timestamptz, p_after_id uuid, p_limit integer
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 1000
    or (p_after_published_at is null) <> (p_after_id is null) then
    return jsonb_build_object('kind','invalid');
  end if;

  with candidates as materialized (
    select a.id,a.slug,a.published_at
    from public.articles a
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles p on p.id=a.owner_profile_id and p.active
    -- Legacy NULL bodies render as unavailable/noindex. Writes validate
    -- non-null bodies, so a full document check is not repeated per row.
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
        'publishedAt',to_char(pg.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      order by pg.published_at desc,pg.id desc) from page pg),'[]'::jsonb),
    'hasMore',(select count(*) from candidates)>p_limit)
  into result;
  return result;
end;
$$;

-- Archive sets are admin-managed and small; each is bounded and fails closed.
-- ponytail: 5,000 per kind; page these like articles if a set approaches it.
create or replace function public.list_public_sitemap_archives()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  with visible as materialized (
    select a.id,a.section_id,a.owner_profile_id
    from public.articles a
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles p on p.id=a.owner_profile_id and p.active
    where a.status='published'
  ), sections as (
    -- Joins from visible articles read each article once; correlated probes
    -- of the unindexed CTE would cost entities x articles.
    select distinct s.slug from visible v join public.sections s on s.id=v.section_id
    order by s.slug limit 5001
  ), categories as (
    select distinct s.slug section_slug,c.slug from visible v
    join public.article_categories ac on ac.article_id=v.id
    join public.categories c on c.id=ac.category_id and c.active and c.section_id=v.section_id
    join public.sections s on s.id=c.section_id
    order by s.slug,c.slug limit 5001
  ), tags as (
    select distinct t.slug from visible v
    join public.article_tags atg on atg.article_id=v.id
    join public.tags t on t.id=atg.tag_id
    order by t.slug limit 5001
  ), authors as (
    select distinct p.slug from (
      select v.owner_profile_id profile_id from visible v
      union
      select ac.profile_id from visible v join public.article_contributors ac on ac.article_id=v.id
    ) x join public.profiles p on p.id=x.profile_id and p.active
    order by p.slug limit 5001
  )
  select case when (select count(*) from sections)>5000 or (select count(*) from categories)>5000
      or (select count(*) from tags)>5000 or (select count(*) from authors)>5000
    then jsonb_build_object('kind','unavailable')
    else jsonb_build_object(
      'kind','ok',
      'sections',coalesce((select jsonb_agg(slug order by slug) from sections),'[]'::jsonb),
      'categories',coalesce((select jsonb_agg(jsonb_build_object('section',section_slug,'slug',slug)
        order by section_slug,slug) from categories),'[]'::jsonb),
      'tags',coalesce((select jsonb_agg(slug order by slug) from tags),'[]'::jsonb),
      'authors',coalesce((select jsonb_agg(slug order by slug) from authors),'[]'::jsonb))
    end
  into result;
  return result;
end;
$$;

revoke all on function public.list_public_sitemap_articles(timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_public_sitemap_articles(timestamptz,uuid,integer) to anon,authenticated;
revoke all on function public.list_public_sitemap_archives() from public,anon,authenticated;
grant execute on function public.list_public_sitemap_archives() to anon,authenticated;
