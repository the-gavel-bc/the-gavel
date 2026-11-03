-- Add a relational main image without changing Phase 3 draft payloads or receipts.
create table public.article_main_images (
  article_id uuid primary key references public.articles(id) on update restrict on delete restrict,
  asset_id uuid not null unique,
  alt_text text not null check (char_length(alt_text) between 1 and 240
    and alt_text !~ '(^[[:space:]]|[[:space:]]$)'),
  credit text not null check (char_length(credit) between 1 and 240
    and credit !~ '(^[[:space:]]|[[:space:]]$)'),
  foreign key (asset_id,article_id) references public.media_assets(id,article_id)
    on update restrict on delete restrict
);
alter table public.article_main_images enable row level security;
revoke all on table public.article_main_images from public,anon,authenticated;
grant select on table public.article_main_images to authenticated;
create policy article_main_images_owner_or_admin_read on public.article_main_images
  for select to authenticated using (private.can_read_article(article_id));

create table private.media_write_receipts (
  actor_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  request_id uuid not null,
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  payload_hash bytea not null check (octet_length(payload_hash)=32),
  result_version integer not null check (result_version>=1),
  result_updated_at timestamptz not null,
  changed boolean not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id,request_id)
);
alter table private.media_write_receipts enable row level security;
revoke all on table private.media_write_receipts from public,anon,authenticated;

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
  select jsonb_build_object('assetId',asset_id,'altText',alt_text,'credit',credit)
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
  p_article_id uuid,p_expected_version integer,p_request_id uuid,p_asset_id uuid,p_alt_text text,p_credit text
) returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare actor uuid := auth.uid(); actor_profile uuid; article public.articles%rowtype;
  receipt private.media_write_receipts%rowtype; image public.article_main_images%rowtype;
  asset public.media_assets%rowtype; fingerprint bytea; changed boolean;
  committed_version integer; committed_at timestamptz;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 1
    or (p_asset_id is null and (p_alt_text is not null or p_credit is not null))
    or (p_asset_id is not null and (
      p_alt_text is null or char_length(p_alt_text) not between 1 and 240
      or p_alt_text ~ '(^[[:space:]]|[[:space:]]$)'
      or p_credit is null or char_length(p_credit) not between 1 and 240
      or p_credit ~ '(^[[:space:]]|[[:space:]]$)'
    )) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  fingerprint := sha256(convert_to(jsonb_build_object(
    'articleId',p_article_id,'expectedVersion',p_expected_version,'assetId',p_asset_id,
    'altText',p_alt_text,'credit',p_credit)::text,'UTF8'));
  select * into article from public.articles where id=p_article_id for update;
  if not found or (article.owner_profile_id<>actor_profile and not private.is_active_administrator()) then
    return '{"ok":false,"code":"not_found"}'::jsonb;
  end if;
  select * into receipt from private.media_write_receipts where actor_user_id=actor and request_id=p_request_id;
  if found then
    if receipt.article_id=p_article_id and receipt.payload_hash=fingerprint then
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
      or image.alt_text is distinct from p_alt_text or image.credit is distinct from p_credit end;
  if changed and article.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  committed_version := article.edit_version;
  committed_at := article.updated_at;
  begin
    if changed then
      if p_asset_id is null then
        delete from public.article_main_images where article_id=p_article_id;
      else
        insert into public.article_main_images(article_id,asset_id,alt_text,credit)
          values(p_article_id,p_asset_id,p_alt_text,p_credit)
          on conflict (article_id) do update set asset_id=excluded.asset_id,
            alt_text=excluded.alt_text,credit=excluded.credit;
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
revoke all on function public.set_article_main_image(uuid,integer,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.set_article_main_image(uuid,integer,uuid,uuid,text,text)
  to authenticated;
