-- Additive metadata; old six-argument calls resolve to the new defaulted signature.
alter table public.article_main_images add column caption text
  check (caption is null or (char_length(caption) between 1 and 400
    and caption !~ '(^[[:space:]]|[[:space:]]$)'));

drop function public.set_article_main_image(uuid,integer,uuid,uuid,text,text);

create or replace function private.capture_draft_snapshot(p_article_id uuid) returns jsonb
language plpgsql set search_path = '' set timezone = 'UTC' as $$
declare snapshot jsonb; article_fields jsonb; categories jsonb; tags jsonb; credits jsonb; main_image jsonb;
begin
  select jsonb_build_object(
    'id',a.id,'ownerProfileId',a.owner_profile_id,'sectionId',a.section_id,'title',a.title,'slug',a.slug,
    'excerpt',a.excerpt,'content',a.content,'seoKeyphrase',a.seo_keyphrase,'metaDescription',a.meta_description,
    'status',a.status,'publishedAt',a.published_at,'archivedAt',a.archived_at,
    'createdAt',a.created_at,'updatedAt',a.updated_at,'editVersion',a.edit_version
  ) into article_fields from public.articles a where a.id=p_article_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(category_id order by category_id),'[]'::jsonb) into categories
    from public.article_categories where article_id=p_article_id;
  select coalesce(jsonb_agg(tag_id order by tag_id),'[]'::jsonb) into tags
    from public.article_tags where article_id=p_article_id;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',profile_id,'role',contribution_role,'displayOrder',display_order)
    order by profile_id,contribution_role::text collate "C"),'[]'::jsonb) into credits
    from public.article_contributors where article_id=p_article_id;
  select jsonb_build_object('assetId',asset_id,'altText',alt_text,'credit',credit,'caption',caption)
    into main_image from public.article_main_images where article_id=p_article_id;
  snapshot := jsonb_build_object('format','gavel-article-snapshot','version',1,'article',article_fields,
    'categoryIds',categories,'tagIds',tags,'contributors',credits,'mainImage',main_image);
  if octet_length(snapshot::text) > 2097152 then
    raise exception using errcode='22023',message='Draft snapshot exceeds storage bound';
  end if;
  return snapshot;
end;
$$;

create function public.set_article_main_image(
  p_article_id uuid,p_expected_version integer,p_request_id uuid,p_asset_id uuid,p_alt_text text,p_credit text,p_caption text default null
) returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare actor uuid := auth.uid(); actor_profile uuid; article public.articles%rowtype;
  receipt private.media_write_receipts%rowtype; image public.article_main_images%rowtype;
  asset public.media_assets%rowtype; fingerprint bytea; changed boolean;
  committed_version integer; committed_at timestamptz; legacy_fingerprint bytea;
begin
  p_caption := nullif(regexp_replace(p_caption,'^[[:space:]]+|[[:space:]]+$','','g'),'');
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 1
    or (p_asset_id is null and (p_alt_text is not null or p_credit is not null or p_caption is not null))
    or (p_asset_id is not null and (
      p_alt_text is null or char_length(p_alt_text) not between 1 and 240
      or p_alt_text ~ '(^[[:space:]]|[[:space:]]$)'
      or p_credit is null or char_length(p_credit) not between 1 and 240
      or p_credit ~ '(^[[:space:]]|[[:space:]]$)'
      or (p_caption is not null and (char_length(p_caption) not between 1 and 400
        or p_caption ~ '(^[[:space:]]|[[:space:]]$)'))
    )) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  legacy_fingerprint := sha256(convert_to(jsonb_build_object(
    'articleId',p_article_id,'expectedVersion',p_expected_version,'assetId',p_asset_id,
    'altText',p_alt_text,'credit',p_credit)::text,'UTF8'));
  fingerprint := sha256(convert_to(jsonb_build_object(
    'articleId',p_article_id,'expectedVersion',p_expected_version,'assetId',p_asset_id,
    'altText',p_alt_text,'credit',p_credit,'caption',p_caption)::text,'UTF8'));
  select * into article from public.articles where id=p_article_id for update;
  if not found or (article.owner_profile_id<>actor_profile and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into receipt from private.media_write_receipts where actor_user_id=actor and request_id=p_request_id;
  if found then
    if receipt.article_id=p_article_id and (receipt.payload_hash=fingerprint or
      (p_caption is null and receipt.payload_hash=legacy_fingerprint)) then
      return jsonb_build_object('ok',true,'articleId',p_article_id,'version',receipt.result_version,
        'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
    end if;
    return '{"ok":false,"code":"request_conflict"}'::jsonb;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if article.status<>'draft' or article.edit_version<>p_expected_version then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  if p_asset_id is not null then
    select * into asset from public.media_assets where id=p_asset_id for share;
    if not found or asset.article_id<>p_article_id or asset.status<>'finalized' then
      return '{"ok":false,"code":"invalid_input"}'::jsonb;
    end if;
  end if;
  select * into image from public.article_main_images where article_id=p_article_id;
  changed := case when p_asset_id is null then image.asset_id is not null
    else image.asset_id is distinct from p_asset_id
      or image.alt_text is distinct from p_alt_text or image.credit is distinct from p_credit
      or image.caption is distinct from p_caption end;
  if changed and article.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  committed_version := article.edit_version;
  committed_at := article.updated_at;
  begin
    if changed then
      if p_asset_id is null then
        delete from public.article_main_images where article_id=p_article_id;
      else
        insert into public.article_main_images(article_id,asset_id,alt_text,credit,caption)
          values(p_article_id,p_asset_id,p_alt_text,p_credit,p_caption)
          on conflict (article_id) do update set asset_id=excluded.asset_id,
            alt_text=excluded.alt_text,credit=excluded.credit,caption=excluded.caption;
      end if;
      update public.articles set edit_version=edit_version+1 where id=p_article_id
        returning edit_version,updated_at into committed_version,committed_at;
      insert into public.article_revisions(article_id,actor_user_id,snapshot)
        values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
      insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
        values(actor,'article.updated','article',p_article_id,p_request_id);
    end if;
    insert into private.media_write_receipts(actor_user_id,request_id,article_id,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,p_article_id,fingerprint,committed_version,committed_at,changed);
  exception when others then
    raise log 'main image write failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'version',committed_version,
    'updatedAt',committed_at,'replayed',false,'changed',changed);
exception when others then
  raise log 'main image write failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
revoke all on function public.set_article_main_image(uuid,integer,uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.set_article_main_image(uuid,integer,uuid,uuid,text,text,text)
  to authenticated;

-- This is the only anonymous article detail entry point. It deliberately
-- returns an allowlist rather than granting access to the underlying rows.
create or replace function public.get_public_article(p_slug text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
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
  select jsonb_build_object('displayName',p.display_name,'slug',p.slug,'biography',p.biography)
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
        jsonb_build_object('displayName',p.display_name,'slug',p.slug,
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
$$;
revoke all on function public.get_public_article(text) from public,anon,authenticated;
grant execute on function public.get_public_article(text) to anon,authenticated;
