-- Public cards are a separate allowlist; article bodies never enter this query.
create or replace function public.list_public_articles(
  p_scope text, p_primary text, p_secondary text, p_limit integer, p_cursor jsonb
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  cursor_at timestamptz;
  cursor_id uuid;
  result jsonb;
begin
  if p_scope is null or p_scope not in ('latest','section','category','tag','author')
    or p_limit is null or p_limit not between 1 and 24
    or (p_scope='latest' and (p_primary is not null or p_secondary is not null))
    or (p_scope<>'latest' and (p_primary is null or char_length(p_primary) not between 1 and 180
      or p_primary !~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
    or (p_scope='category' and (p_secondary is null or char_length(p_secondary) not between 1 and 120
      or p_secondary !~ '^[a-z0-9]+(-[a-z0-9]+)*$'))
    or (p_scope<>'category' and p_secondary is not null) then
    return jsonb_build_object('kind','invalid');
  end if;

  if p_cursor is not null then
    if jsonb_typeof(p_cursor) is distinct from 'object' then
      return jsonb_build_object('kind','invalid');
    end if;
    if octet_length(p_cursor::text)>1024
      or (select count(*) from jsonb_object_keys(p_cursor))<>6
      or p_cursor->'version' is distinct from '1'::jsonb
      or p_cursor->'scope' is distinct from to_jsonb(p_scope)
      or p_cursor->'primary' is distinct from coalesce(to_jsonb(p_primary),'null'::jsonb)
      or p_cursor->'secondary' is distinct from coalesce(to_jsonb(p_secondary),'null'::jsonb)
      or jsonb_typeof(p_cursor->'publishedAt') is distinct from 'string'
      or (p_cursor->>'publishedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'
      or jsonb_typeof(p_cursor->'id') is distinct from 'string'
      or (p_cursor->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('kind','invalid');
    end if;
    begin
      cursor_at := (p_cursor->>'publishedAt')::timestamptz;
      cursor_id := (p_cursor->>'id')::uuid;
      if to_char(cursor_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        <> p_cursor->>'publishedAt' then
        return jsonb_build_object('kind','invalid');
      end if;
    exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
      return jsonb_build_object('kind','invalid');
    end;
  end if;

  -- STABLE holds the calling statement's snapshot across cards and associations.
  with candidates as materialized (
    select a.id,a.slug,a.title,a.excerpt,a.published_at,a.section_id,a.owner_profile_id,
      s.name section_name,s.slug section_slug,p.display_name owner_name,p.slug owner_slug
    from public.articles a
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles p on p.id=a.owner_profile_id and p.active
    where a.status='published'
      and (cursor_at is null or (a.published_at,a.id)<(cursor_at,cursor_id))
      and case p_scope
        when 'latest' then true
        when 'section' then s.slug=p_primary
        when 'category' then s.slug=p_primary and exists (
          select 1 from public.article_categories ac join public.categories c on c.id=ac.category_id
          where ac.article_id=a.id and c.section_id=a.section_id and c.active and c.slug=p_secondary)
        when 'tag' then exists (
          select 1 from public.article_tags atg join public.tags t on t.id=atg.tag_id
          where atg.article_id=a.id and t.slug=p_primary)
        when 'author' then p.slug=p_primary or exists (
          select 1 from public.article_contributors ac join public.profiles cp on cp.id=ac.profile_id
          where ac.article_id=a.id and cp.active and cp.slug=p_primary)
        else false end
    order by a.published_at desc,a.id desc
    limit p_limit+1
  ), page as materialized (
    select * from candidates order by published_at desc,id desc limit p_limit
  ), cards as (
    select pg.*,
      (select coalesce(jsonb_agg(w.value order by w.display_order,w.slug),'[]'::jsonb)
       from (select ac.display_order,cp.slug,
           jsonb_build_object('displayName',cp.display_name,'slug',cp.slug) value
         from public.article_contributors ac join public.profiles cp on cp.id=ac.profile_id and cp.active
         where ac.article_id=pg.id and ac.contribution_role='writer'
         order by ac.display_order,cp.slug limit 33) w) writers,
      (select jsonb_build_object('id',m.id,'width',m.width,'height',m.height,'alt',ami.alt_text,'credit',ami.credit)
       from public.article_main_images ami
       join public.media_assets m on m.id=ami.asset_id and m.article_id=ami.article_id and m.status='finalized'
       where ami.article_id=pg.id) main_image,
      exists(select 1 from public.article_main_images ami where ami.article_id=pg.id
        and not exists(select 1 from public.media_assets m where m.id=ami.asset_id
          and m.article_id=ami.article_id and m.status='finalized')) bad_image
    from page pg
  )
  select case when coalesce(bool_or(char_length(c.owner_slug)>180 or jsonb_array_length(c.writers)>32
    or exists(select 1 from jsonb_array_elements(c.writers) w where char_length(w->>'slug')>180)
    or c.bad_image),false) then jsonb_build_object('kind','unavailable')
  else jsonb_build_object(
    'kind','ok',
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'slug',c.slug,'title',c.title,'excerpt',c.excerpt,
      'publishedAt',to_char(c.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'section',jsonb_build_object('name',c.section_name,'slug',c.section_slug),
      'owner',jsonb_build_object('displayName',c.owner_name,'slug',c.owner_slug),
      'writers',c.writers,'mainImage',c.main_image) order by c.published_at desc,c.id desc)
      filter (where c.id is not null),'[]'::jsonb),
    'nextCursor',case when (select count(*) from candidates)>p_limit then
      (select jsonb_build_object('version',1,'scope',p_scope,'primary',p_primary,'secondary',p_secondary,
        'publishedAt',to_char(pg.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',pg.id)
       from page pg order by pg.published_at asc,pg.id asc limit 1) else null end)
  end into result from cards c;
  return result;
end;
$$;
revoke all on function public.list_public_articles(text,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.list_public_articles(text,text,text,integer,jsonb) to anon,authenticated;
