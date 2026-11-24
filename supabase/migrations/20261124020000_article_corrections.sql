-- Article corrections: an optional note editors and administrators add to a
-- draft in review or a live article. It shows at the end of the public article
-- and marks it "Updated". It is saved by its own function, not the draft
-- input, so no existing save contract changes. Plan: docs/superpowers/plans/2026-11-24-article-corrections.md

alter table public.articles
  add column correction text,
  add column correction_updated_at timestamptz,
  add constraint articles_correction_check check (correction is null or (
    pg_catalog.char_length(correction) between 1 and 2000
    and correction !~ '[<>]'
    and pg_catalog.replace(pg_catalog.replace(correction, E'\n', ''), E'\t', '') !~ '[[:cntrl:]]'
    and correction !~ '(^[[:space:]]|[[:space:]]$)')),
  add constraint articles_correction_pair_check check ((correction is null) = (correction_updated_at is null));
grant select (correction, correction_updated_at) on public.articles to authenticated;

-- Keep every action other migrations allowed; add the correction event.
do $$ declare previous_expression text; begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into strict previous_expression
    from pg_catalog.pg_constraint where conrelid='public.audit_events'::regclass
      and conname='audit_events_action_resource_check';
  alter table public.audit_events drop constraint audit_events_action_resource_check;
  execute pg_catalog.format('alter table public.audit_events add constraint audit_events_action_resource_check check ((%s) or (resource_type = %L and action = %L)) not valid',
    previous_expression,'article','article.corrected');
  alter table public.audit_events validate constraint audit_events_action_resource_check;
end $$;

alter table private.draft_write_receipts drop constraint draft_write_receipts_check;
alter table private.draft_write_receipts add constraint draft_write_receipts_check check (
  (operation = 'create' and expected_version is null)
  or (operation in ('save','save_published','publish','archive','restore','submit','return','set_correction')
    and expected_version >= 1 and expected_version is not null));
alter table private.draft_write_receipts drop constraint draft_write_receipts_operation_check;
alter table private.draft_write_receipts add constraint draft_write_receipts_operation_check check (
  operation in ('create','save','save_published','publish','archive','restore','submit','return','set_correction'));

CREATE OR REPLACE FUNCTION private.article_authority(p_article_id uuid, p_user_id uuid, p_mode text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.articles a
    join public.memberships m on m.user_id = p_user_id and m.active
    join public.profiles me on me.auth_user_id = p_user_id and me.active
    where a.id = p_article_id
      and case p_mode
        when 'edit' then m.role = 'administrator'
          or (a.status = 'draft' and (
            (a.owner_profile_id = me.id and a.review_requested_at is null)
            or (m.role = 'editor' and a.review_requested_at is not null)))
        when 'read' then m.role = 'administrator' or a.owner_profile_id = me.id
          or (m.role = 'editor' and (
            (a.status = 'draft' and a.review_requested_at is not null)
            or a.published_by_profile_id = me.id))
        when 'replay' then m.role in ('administrator', 'editor') or a.owner_profile_id = me.id
        when 'submit' then a.owner_profile_id = me.id
        when 'review' then m.role in ('administrator', 'editor')
        when 'publish' then m.role = 'administrator'
          or (m.role = 'editor' and (a.owner_profile_id = me.id or a.review_requested_at is not null))
        -- Corrections: administrators on any live article; editors on a draft in
        -- review or an article they published.
        when 'correct' then a.status in ('draft', 'published') and (m.role = 'administrator'
          or (m.role = 'editor' and (
            (a.status = 'draft' and a.review_requested_at is not null)
            or (a.status = 'published' and a.published_by_profile_id = me.id))))
        when 'archive' then m.role = 'administrator'
          or (m.role = 'editor' and a.published_by_profile_id = me.id)
        else false end
  );
$function$;

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
    'tags',tags,'contributors',contributors,'mainImage',main_image,'bodyImages',body_images,
    'correction',article.correction,'correctedAt',article.correction_updated_at));
end;
$function$;

-- p_expected_correction is what the caller saw (null for none); a different
-- stored value is a conflict, so two people cannot overwrite each other. A
-- blank new correction clears it. Setting the same text again changes nothing.
create function public.set_article_correction(p_article_id uuid, p_expected_correction text,
  p_request_id uuid, p_correction text)
returns jsonb language plpgsql volatile security definer set search_path = '' set "TimeZone" to 'UTC' as $$
declare
  actor uuid := auth.uid(); actor_profile uuid; new_text text; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; current_article public.articles%rowtype;
  changed boolean; stamp timestamptz;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  new_text := nullif(pg_catalog.btrim(p_correction, E' \t\r\n'), '');
  if p_article_id is null or p_request_id is null
    or (p_expected_correction is not null and pg_catalog.char_length(p_expected_correction) > 2000)
    or (p_correction is not null and pg_catalog.char_length(p_correction) > 4000)
    or (new_text is not null and (pg_catalog.char_length(new_text) > 2000 or new_text ~ '[<>]'
      or pg_catalog.replace(pg_catalog.replace(new_text, E'\n', ''), E'\t', '') ~ '[[:cntrl:]]'
      or private.has_unsupported_display_character(new_text))) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  fingerprint := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
    'set_correction', p_article_id, p_expected_correction, new_text)::text, 'UTF8'));
  select * into receipt from private.draft_write_receipts
    where actor_user_id = actor and request_id = p_request_id;
  if receipt.request_id is not null then
    if receipt.operation = 'set_correction' and receipt.payload_hash = fingerprint
      and exists (select 1 from public.articles a where a.id = p_article_id
        and private.article_authority(a.id, actor, 'replay')) then
      return pg_catalog.jsonb_build_object('ok', true, 'articleId', receipt.article_id,
        'correctedAt', (select a.correction_updated_at from public.articles a where a.id = p_article_id),
        'changed', receipt.changed, 'replayed', true);
    end if;
    return '{"ok":false,"code":"request_conflict"}'::jsonb;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  select * into current_article from public.articles a where a.id = p_article_id
    and private.article_authority(a.id, actor, 'correct') for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if current_article.correction is distinct from p_expected_correction then
    return '{"ok":false,"code":"conflict"}'::jsonb;
  end if;
  changed := current_article.correction is distinct from new_text;
  stamp := current_article.correction_updated_at;
  if changed then
    stamp := case when new_text is null then null else pg_catalog.clock_timestamp() end;
    update public.articles set correction = new_text, correction_updated_at = stamp
      where id = p_article_id;
    insert into public.audit_events(actor_user_id, action, resource_type, resource_id, correlation_id)
      values(actor, 'article.corrected', 'article', p_article_id, p_request_id);
  end if;
  insert into private.draft_write_receipts(actor_user_id, request_id, operation, article_id,
    expected_version, payload_hash, result_version, result_updated_at, changed)
    values(actor, p_request_id, 'set_correction', p_article_id, current_article.edit_version, fingerprint,
      current_article.edit_version, pg_catalog.clock_timestamp(), changed);
  return pg_catalog.jsonb_build_object('ok', true, 'articleId', p_article_id,
    'correctedAt', stamp, 'changed', changed, 'replayed', false);
exception when serialization_failure or deadlock_detected or lock_not_available then
  return '{"ok":false,"code":"retryable"}'::jsonb;
when others then
  raise log 'set correction failed state=% request=%', sqlstate, p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
revoke all on function public.set_article_correction(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_article_correction(uuid, text, uuid, text) to authenticated;
