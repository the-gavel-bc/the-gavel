-- Public visibility is independent of editorial ownership and profile activity.
alter table public.profiles add column public_page_hidden boolean not null default false;

create function private.has_public_author_page(p_user_id uuid,p_active boolean,p_hidden boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select p_active and not p_hidden and p_user_id is not null
    and exists(select 1 from public.memberships m where m.user_id=p_user_id and m.active);
$$;
revoke all on function private.has_public_author_page(uuid,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.has_public_author_page(uuid,boolean,boolean) to anon,authenticated;

alter policy profiles_public_read on public.profiles
  using (private.has_public_author_page(auth_user_id,active,public_page_hidden));

alter policy profiles_authenticated_read on public.profiles using (
  private.has_public_author_page(auth_user_id,active,public_page_hidden)
  or (active and (select exists (select 1 from public.current_profile())))
  or (select private.is_active_administrator())
);

alter table private.profile_write_receipts drop constraint profile_write_receipts_operation_check;
alter table private.profile_write_receipts add constraint profile_write_receipts_operation_check
  check (operation in ('create','save','deactivate','save_own','create_guest_author','moderate'));

create function public.moderate_member_profile(
  p_user_id uuid,p_expected_version integer,p_request_id uuid,
  p_hide_page boolean,p_clear_biography boolean,p_reset_display_name boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fingerprint text; profile public.profiles%rowtype;
  receipt private.profile_write_receipts%rowtype; changed boolean; result jsonb;
begin
  if p_user_id is null or p_expected_version is null or p_expected_version<1 or p_request_id is null
    or p_hide_page is null or p_clear_biography is null or p_reset_display_name is null then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if not private.is_active_administrator() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  if not private.is_active_administrator() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;

  fingerprint:=private.membership_payload_hash(jsonb_build_object('operation','moderate','userId',p_user_id,
    'expectedVersion',p_expected_version,'hide',p_hide_page,'clearBiography',p_clear_biography,
    'resetDisplayName',p_reset_display_name));
  select * into receipt from private.profile_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  select * into profile from public.profiles p where p.auth_user_id=p_user_id
    and exists(select 1 from public.memberships m where m.user_id=p_user_id) for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if profile.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  changed:=profile.public_page_hidden is distinct from p_hide_page
    or (p_clear_biography and profile.biography is not null)
    or (p_reset_display_name and profile.display_name<>'Gavel contributor');
  if changed then
    if profile.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    update public.profiles set public_page_hidden=p_hide_page,
      biography=case when p_clear_biography then null else biography end,
      display_name=case when p_reset_display_name then 'Gavel contributor' else display_name end,
      edit_version=edit_version+1
    where id=profile.id returning * into profile;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id,detail)
      values(actor,'profile.updated','profile',profile.id,p_request_id,jsonb_build_object(
        'reason','moderation','hidden',p_hide_page,'clearedBiography',p_clear_biography,'resetDisplayName',p_reset_display_name));
  end if;
  result:=jsonb_build_object('ok',true,'version',profile.edit_version,'hidden',p_hide_page,
    'changed',changed,'replayed',false);
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    values(actor,p_request_id,'moderate',profile.id,fingerprint,result);
  return result;
end;
$$;
revoke all on function public.moderate_member_profile(uuid,integer,uuid,boolean,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.moderate_member_profile(uuid,integer,uuid,boolean,boolean,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.get_public_article(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  article public.articles%rowtype;
  section jsonb;
  owner jsonb;
  categories jsonb;
  tags jsonb;
  contributors jsonb;
  main_image jsonb;
  body_images jsonb;
begin
  if p_slug is null or char_length(p_slug) not between 1 and 180
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return jsonb_build_object('kind','notFound');
  end if;
  select * into article from public.articles a
    where a.slug = p_slug and a.status = 'published';
  if not found then return jsonb_build_object('kind','notFound'); end if;

  if article.content is null or not private.is_valid_draft_document(article.content) then
    return jsonb_build_object('kind','unavailable');
  end if;
  select jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug)
    into section from public.sections s where s.id=article.section_id and s.active;
  select jsonb_build_object('displayName',p.display_name,'slug',case when private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden) then p.slug end,
    'biography',case when private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden) then p.biography end)
    into owner from public.profiles p where p.id=article.owner_profile_id and p.active;
  if section is null or owner is null then
    return jsonb_build_object('kind','unavailable');
  end if;

  select coalesce(jsonb_agg(x.value order by x.name,x.id),'[]'::jsonb) into categories
    from (select c.id,c.name,jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug) value
      from public.article_categories ac join public.categories c on c.id=ac.category_id
      where ac.article_id=article.id and c.active and c.section_id=article.section_id
      order by c.name,c.id limit 33) x;
  select coalesce(jsonb_agg(x.value order by x.name,x.id),'[]'::jsonb) into tags
    from (select t.id,t.name,jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug) value
      from public.article_tags atg join public.tags t on t.id=atg.tag_id
      where atg.article_id=article.id order by t.name,t.id limit 65) x;
  select coalesce(jsonb_agg(x.value order by x.display_order,x.slug,x.role),'[]'::jsonb) into contributors
    from (select ac.display_order,p.slug,ac.contribution_role::text role,
        jsonb_build_object('displayName',p.display_name,'slug',case when private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden) then p.slug end,
          'role',ac.contribution_role,'displayOrder',ac.display_order) value
      from public.article_contributors ac join public.profiles p on p.id=ac.profile_id
      where ac.article_id=article.id and p.active
      order by ac.display_order,p.slug,ac.contribution_role limit 33) x;
  if jsonb_array_length(categories)>32 or jsonb_array_length(tags)>64
    or jsonb_array_length(contributors)>32 then
    return jsonb_build_object('kind','unavailable');
  end if;

  -- Never expose a body containing references that cannot be resolved to
  -- finalized assets attached to the current article.
  if exists (
    select 1 from private.body_image_ids(article.content) b
    where not exists (
      select 1 from public.article_body_images abi
      join public.media_assets m on m.id=abi.asset_id and m.article_id=abi.article_id
      where abi.article_id=article.id and abi.asset_id=b.asset_id and m.status='finalized'
    )
  ) then return jsonb_build_object('kind','unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'width',m.width,'height',m.height) order by m.id),'[]'::jsonb)
    into body_images from private.body_image_ids(article.content) b
    join public.media_assets m on m.id=b.asset_id and m.article_id=article.id and m.status='finalized';

  if exists(select 1 from public.article_main_images ami where ami.article_id=article.id)
    and not exists(select 1 from public.article_main_images ami
      join public.media_assets m on m.id=ami.asset_id and m.article_id=ami.article_id
      where ami.article_id=article.id and m.status='finalized') then
    return jsonb_build_object('kind','unavailable');
  end if;
  select jsonb_build_object('id',m.id,'width',m.width,'height',m.height,'alt',ami.alt_text,'credit',ami.credit,'caption',ami.caption)
    into main_image from public.article_main_images ami
    join public.media_assets m on m.id=ami.asset_id and m.article_id=ami.article_id
    where ami.article_id=article.id and m.status='finalized';

  return jsonb_build_object('kind','ok','article',jsonb_build_object(
    'id',article.id,'slug',article.slug,'title',article.title,'excerpt',article.excerpt,
    'metaDescription',article.meta_description,'publishedAt',article.published_at,
    'content',article.content,'section',section,'owner',owner,'categories',categories,
    'tags',tags,'contributors',contributors,'mainImage',main_image,'bodyImages',body_images));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_profile_photo(p_slug text)
 RETURNS TABLE(bytes bytea, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ph.bytes, ph.updated_at from public.profiles p
    join private.profile_photos ph on ph.profile_id = p.id
    join public.memberships m on m.user_id = p.auth_user_id and m.active
    where p.slug = p_slug and private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden);
$function$
;
CREATE OR REPLACE FUNCTION private.homepage_card_map(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare cards jsonb; bad boolean; expected integer;
begin
  if p_ids is null or cardinality(p_ids)>412 then return null; end if;
  select count(distinct id) into expected from unnest(p_ids) id;
  with requested as (select distinct id from unnest(p_ids) id),
  rows as (
    select a.id,a.slug,a.title,a.excerpt,a.published_at,s.name section_name,s.slug section_slug,
      p.display_name owner_name,case when private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden) then p.slug end owner_slug,
      (select coalesce(jsonb_agg(w.value order by w.display_order,w.slug),'[]'::jsonb)
       from (select ac.display_order,cp.slug,jsonb_build_object('displayName',cp.display_name,'slug',case when private.has_public_author_page(cp.auth_user_id,cp.active,cp.public_page_hidden) then cp.slug end) value
        from public.article_contributors ac join public.profiles cp on cp.id=ac.profile_id and cp.active
        where ac.article_id=a.id and ac.contribution_role='writer'
        order by ac.display_order,cp.slug limit 33) w) writers,
      (select jsonb_build_object('id',m.id,'width',m.width,'height',m.height,'alt',ami.alt_text,'credit',ami.credit)
       from public.article_main_images ami join public.media_assets m
        on m.id=ami.asset_id and m.article_id=ami.article_id and m.status='finalized'
       where ami.article_id=a.id) main_image,
      exists(select 1 from public.article_main_images ami where ami.article_id=a.id
        and not exists(select 1 from public.media_assets m where m.id=ami.asset_id and m.article_id=a.id and m.status='finalized')) bad_image
    from requested r join public.articles a on a.id=r.id and a.status='published'
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles p on p.id=a.owner_profile_id and p.active
  )
  select coalesce(jsonb_object_agg(r.id::text,jsonb_build_object(
    'id',r.id,'slug',r.slug,'title',r.title,'excerpt',r.excerpt,
    'publishedAt',to_char(r.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'section',jsonb_build_object('name',r.section_name,'slug',r.section_slug),
    'owner',jsonb_build_object('displayName',r.owner_name,'slug',r.owner_slug),
    'writers',r.writers,'mainImage',r.main_image)),'{}'::jsonb),
    coalesce(bool_or(r.bad_image or char_length(r.owner_slug)>180 or jsonb_array_length(r.writers)>32
      or exists(select 1 from jsonb_array_elements(r.writers) w where char_length(w->>'slug')>180)),false)
  into cards,bad from rows r;
  if bad or (select count(*) from jsonb_object_keys(cards))<>expected then return null; end if;
  return cards;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_public_articles(p_scope text, p_primary text, p_secondary text, p_limit integer, p_cursor jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      s.name section_name,s.slug section_slug,p.display_name owner_name,case when private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden) then p.slug end owner_slug
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
        when 'author' then (private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden) and p.slug=p_primary) or exists (
          select 1 from public.article_contributors ac join public.profiles cp on cp.id=ac.profile_id
          where ac.article_id=a.id and private.has_public_author_page(cp.auth_user_id,cp.active,cp.public_page_hidden) and cp.slug=p_primary)
        else false end
    order by a.published_at desc,a.id desc
    limit p_limit+1
  ), page as materialized (
    select * from candidates order by published_at desc,id desc limit p_limit
  ), cards as (
    select pg.*,
      (select coalesce(jsonb_agg(w.value order by w.display_order,w.slug),'[]'::jsonb)
       from (select ac.display_order,cp.slug,
           jsonb_build_object('displayName',cp.display_name,'slug',case when private.has_public_author_page(cp.auth_user_id,cp.active,cp.public_page_hidden) then cp.slug end) value
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
$function$
;
CREATE OR REPLACE FUNCTION public.list_public_sitemap_articles(p_after_published_at timestamp with time zone, p_after_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select a.id,a.slug,a.published_at,a.section_id,s.slug section_slug,case when private.has_public_author_page(p.auth_user_id,p.active,p.public_page_hidden) then p.slug end owner_slug
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
          select pg.owner_slug slug where pg.owner_slug is not null
          union
          select cp.slug from public.article_contributors ac
          join public.profiles cp on cp.id=ac.profile_id and private.has_public_author_page(cp.auth_user_id,cp.active,cp.public_page_hidden)
          where ac.article_id=pg.id
          order by 1 limit 65) x))
      order by pg.published_at desc,pg.id desc) from page pg),'[]'::jsonb),
    'hasMore',(select count(*) from candidates)>p_limit)
  into result;
  return result;
end;
$function$
;
