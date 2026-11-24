-- One-time import of the demo site's articles. Only the server's service role
-- can call it; the importer script supplies an administrator as the actor.
-- Plan: docs/superpowers/plans/2026-11-24-demo-article-import.md

-- One row per imported demo article, so re-runs skip what is already here.
create table private.demo_import_ledger (
  source_id uuid primary key,
  article_id uuid not null unique,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  imported_at timestamptz not null default pg_catalog.now()
);
-- The profile that owns every imported article, and the one-off writer
-- credits the import created (one per demo byline).
create table private.demo_import_profiles (
  kind text not null check (kind in ('owner', 'writer')),
  display_name text not null,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  primary key (kind, display_name)
);
alter table private.demo_import_ledger enable row level security;
alter table private.demo_import_profiles enable row level security;
revoke all on table private.demo_import_ledger, private.demo_import_profiles
  from public, anon, authenticated;

create function private.demo_import_profile(p_kind text, p_name text)
returns uuid language plpgsql volatile set search_path = '' as $$
declare found_id uuid; next_slug text;
begin
  select profile_id into found_id from private.demo_import_profiles
    where kind = p_kind and display_name = p_name;
  if found_id is not null then return found_id; end if;
  next_slug := private.allocate_profile_slug(p_name, null::uuid);
  if next_slug is null then raise exception 'No profile slug available.' using errcode = 'P0002'; end if;
  insert into public.profiles(display_name, slug) values (p_name, next_slug) returning id into found_id;
  if p_kind = 'writer' then
    insert into private.guest_credit_provenance(profile_id) values (found_id);
  end if;
  insert into private.demo_import_profiles(kind, display_name, profile_id) values (p_kind, p_name, found_id);
  return found_id;
end;
$$;

-- Same name normalization and slug rules as public.ensure_tag, without the
-- per-member daily cap (a trusted one-time import).
create function private.demo_import_tag(p_name text)
returns uuid language plpgsql volatile set search_path = '' as $$
declare normalized text; base text; candidate text; suffix text; tag_id uuid;
begin
  normalized := pg_catalog.btrim(pg_catalog.regexp_replace(p_name,
    U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'));
  if normalized is null or pg_catalog.char_length(normalized) not between 1 and 120
    or normalized ~ U&'[\0001-\001F\007F-\009F]' or private.has_unsupported_display_character(normalized) then
    raise exception 'Invalid tag name.' using errcode = 'P0003';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261112::bigint);
  select id into tag_id from public.tags where pg_catalog.lower(name) = pg_catalog.lower(normalized);
  if tag_id is not null then return tag_id; end if;
  base := private.taxonomy_slug_base(normalized);
  for n in 1..10000 loop
    suffix := case when n = 1 then '' else '-' || n::text end;
    candidate := pg_catalog.rtrim(pg_catalog.left(base, 120 - pg_catalog.char_length(suffix)), '-') || suffix;
    if private.is_reserved_taxonomy_slug(candidate)
      or exists (select 1 from private.slug_redirects where source_path = '/tags/' || candidate) then continue; end if;
    insert into public.tags(name, slug) values (normalized, candidate) on conflict do nothing returning id into tag_id;
    if tag_id is not null then return tag_id; end if;
  end loop;
  raise exception 'No tag slug available.' using errcode = 'P0002';
end;
$$;

-- p_payload: built by scripts/demo-import/convert.mjs. p_image: null, or the
-- processed WebP already uploaded at <articleId>/<assetId>.webp. With
-- p_dry_run every check and write runs and is then rolled back.
create function public.import_demo_article(p_actor_user_id uuid, p_payload jsonb,
  p_image jsonb, p_dry_run boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' set "TimeZone" to 'UTC' as $$
declare
  source uuid; hash text; existing private.demo_import_ledger%rowtype; actor_profile uuid;
  article uuid; section_row public.sections%rowtype; category_ids jsonb := '[]'::jsonb;
  tag_ids jsonb := '[]'::jsonb; name text; owner uuid; writer uuid; draft jsonb; checked jsonb;
  published boolean; published_time timestamptz; pub_date date; final_slug text; result jsonb;
  missing text; asset uuid;
begin
  begin
    source := (p_payload->>'sourceId')::uuid;
    article := (p_payload->>'articleId')::uuid;
  exception when others then return '{"ok":false,"code":"invalid_input","reason":"bad ids"}'::jsonb;
  end;
  if source is null or article is null or p_actor_user_id is null or p_dry_run is null
    or jsonb_typeof(p_payload) is distinct from 'object' then
    return '{"ok":false,"code":"invalid_input","reason":"missing fields"}'::jsonb;
  end if;
  -- The actor must be an active administrator with an active profile.
  select p.id into actor_profile from public.profiles p
    join public.memberships m on m.user_id = p.auth_user_id
    where p.auth_user_id = p_actor_user_id and p.active and m.active and m.role = 'administrator';
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;

  perform pg_catalog.pg_advisory_xact_lock(72300320261124::bigint);
  hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(p_payload - 'articleId', coalesce(p_image - array['assetId','objectKey'], 'null'::jsonb))::text, 'UTF8')), 'hex');
  select * into existing from private.demo_import_ledger where source_id = source;
  if found then
    if existing.source_hash = hash then
      return pg_catalog.jsonb_build_object('ok', true, 'skipped', true, 'articleId', existing.article_id);
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'changed_since_import', 'articleId', existing.article_id);
  end if;

  published := p_payload->>'status' = 'published';
  if not published and p_payload->>'status' is distinct from 'draft' then
    return '{"ok":false,"code":"invalid_input","reason":"status"}'::jsonb;
  end if;
  select * into section_row from public.sections where slug = p_payload->>'section' and active;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'reason', 'unknown section ' || (p_payload->>'section'));
  end if;
  select pg_catalog.string_agg(value, ', ') into missing from pg_catalog.jsonb_array_elements_text(p_payload->'categories') value
    where not exists (select 1 from public.categories c where c.section_id = section_row.id and c.slug = value and c.active);
  if missing is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'reason', 'unknown category ' || missing);
  end if;
  select coalesce(pg_catalog.jsonb_agg(c.id), '[]'::jsonb) into category_ids from public.categories c
    where c.section_id = section_row.id and c.slug in (select pg_catalog.jsonb_array_elements_text(p_payload->'categories'));
  if published then
    begin
      published_time := (p_payload->>'publishedAt')::timestamptz;
    exception when others then published_time := null;
    end;
    if published_time is null then return '{"ok":false,"code":"invalid_input","reason":"publishedAt"}'::jsonb; end if;
    pub_date := (published_time at time zone 'America/New_York')::date;
    if not private.publication_date_allowed(pub_date) then
      return '{"ok":false,"code":"invalid_input","reason":"publication date out of range"}'::jsonb;
    end if;
  end if;

  begin
    owner := private.demo_import_profile('owner', 'The Gavel Archive');
    writer := private.demo_import_profile('writer', p_payload->>'writer');
    for name in select pg_catalog.jsonb_array_elements_text(p_payload->'tags') loop
      tag_ids := tag_ids || pg_catalog.to_jsonb(private.demo_import_tag(name));
    end loop;
    draft := pg_catalog.jsonb_build_object('schemaVersion', 1, 'title', p_payload->'title',
      'sectionId', section_row.id, 'excerpt', p_payload->'excerpt', 'content', p_payload->'content',
      'seoKeyphrase', null, 'metaDescription', null, 'categoryIds', category_ids, 'tagIds', tag_ids,
      'contributors', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'profileId', writer, 'role', 'writer', 'displayOrder', 0)))
      || case when pub_date is null then '{}'::jsonb
        else pg_catalog.jsonb_build_object('publicationDate', pg_catalog.to_char(pub_date, 'YYYY-MM-DD')) end;
    -- The same validation editor saves use.
    checked := private.check_draft_input_for_write(draft);
    if checked->>'ok' <> 'true' then
      raise exception 'draft:%', coalesce(checked->>'code', 'invalid_input') using errcode = 'P0004';
    end if;
    draft := checked->'value';
    if not private.check_draft_references(draft) then
      raise exception 'draft:invalid_references' using errcode = 'P0004';
    end if;
    final_slug := private.allocate_article_slug(p_payload->>'slug', article);
    if final_slug is null then raise exception 'No article slug available.' using errcode = 'P0002'; end if;

    insert into public.articles(id, owner_profile_id, section_id, title, slug, excerpt, content,
      status, published_at, publication_date, published_by_profile_id, review_requested_at,
      correction, correction_updated_at)
    values (article, owner, section_row.id, draft->>'title', final_slug, draft->>'excerpt',
      nullif(draft->'content', 'null'::jsonb),
      case when published then 'published' else 'draft' end::public.article_status,
      published_time, pub_date, case when published then actor_profile end,
      case when published then null else pg_catalog.now() end,
      p_payload->>'correction',
      case when p_payload->>'correction' is null then null
        else coalesce((p_payload->>'correctedAt')::timestamptz, pg_catalog.now()) end);
    insert into public.article_categories(article_id, category_id, section_id)
      select article, value::uuid, section_row.id from pg_catalog.jsonb_array_elements_text(draft->'categoryIds');
    insert into public.article_tags(article_id, tag_id)
      select article, value::uuid from pg_catalog.jsonb_array_elements_text(draft->'tagIds');
    insert into public.article_contributors(article_id, profile_id, contribution_role, display_order)
      values (article, writer, 'writer', 0);

    if p_image is not null and p_image <> 'null'::jsonb then
      asset := (p_image->>'assetId')::uuid;
      if p_image->>'objectKey' is distinct from article::text || '/' || asset::text || '.webp' then
        raise exception 'draft:invalid_image_path' using errcode = 'P0004';
      end if;
      insert into public.media_assets(id, article_id, uploader_user_id, request_id, object_key,
        status, byte_size, width, height, sha256, finalized_at)
      values (asset, article, p_actor_user_id, pg_catalog.gen_random_uuid(), p_image->>'objectKey',
        'finalized', (p_image->>'byteSize')::integer, (p_image->>'width')::integer,
        (p_image->>'height')::integer, p_image->>'sha256', pg_catalog.now());
      insert into public.article_main_images(article_id, asset_id, alt_text, credit, caption)
      values (article, asset, p_image->>'alt', p_image->>'credit', p_image->>'caption');
    end if;

    insert into public.article_revisions(article_id, actor_user_id, snapshot)
      values (article, p_actor_user_id, private.capture_draft_snapshot(article));
    insert into public.audit_events(actor_user_id, action, resource_type, resource_id, correlation_id)
      values (p_actor_user_id, 'article.created', 'article', article, source),
        (p_actor_user_id, case when published then 'article.published' else 'article.submitted' end,
          'article', article, source);
    insert into private.demo_import_ledger(source_id, article_id, source_hash) values (source, article, hash);
    result := pg_catalog.jsonb_build_object('ok', true, 'articleId', article, 'slug', final_slug,
      'dryRun', p_dry_run, 'slugChanged', final_slug <> p_payload->>'slug');
    if p_dry_run then raise exception 'dry run' using errcode = 'P0005'; end if;
  exception
    when sqlstate 'P0005' then return result;
    when sqlstate 'P0004' then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'reason', pg_catalog.substr(sqlerrm, 7));
    when sqlstate 'P0003' then return '{"ok":false,"code":"invalid_input","reason":"tag name"}'::jsonb;
    when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation
      or numeric_value_out_of_range then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_input', 'reason', sqlerrm);
  end;
  return result;
end;
$$;

revoke all on function private.demo_import_profile(text, text), private.demo_import_tag(text)
  from public, anon, authenticated, service_role;
revoke all on function public.import_demo_article(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_demo_article(uuid, jsonb, jsonb, boolean) to service_role;
