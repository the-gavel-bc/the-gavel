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
    where a.status='published'
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
    select s.slug from public.sections s
    where s.active and exists(select 1 from visible v where v.section_id=s.id)
    order by s.slug limit 5001
  ), categories as (
    select s.slug section_slug,c.slug from public.categories c
    join public.sections s on s.id=c.section_id and s.active
    where c.active and exists(
      select 1 from public.article_categories ac join visible v on v.id=ac.article_id
      where ac.category_id=c.id and v.section_id=c.section_id)
    order by s.slug,c.slug limit 5001
  ), tags as (
    select t.slug from public.tags t
    where exists(
      select 1 from public.article_tags atg join visible v on v.id=atg.article_id
      where atg.tag_id=t.id)
    order by t.slug limit 5001
  ), authors as (
    select p.slug from public.profiles p
    where p.active and (
      exists(select 1 from visible v where v.owner_profile_id=p.id)
      or exists(select 1 from public.article_contributors ac join visible v on v.id=ac.article_id
        where ac.profile_id=p.id))
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
