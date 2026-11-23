-- Redirect targets follow stable IDs. This avoids chains when a slug changes again.
create table private.slug_redirects (
  source_path text primary key check (source_path ~ '^(/tags/[a-z0-9-]+|/sections/[a-z0-9-]+(/categories/[a-z0-9-]+)?)$'),
  target_kind text not null check (target_kind in ('tag','section','category')),
  target_id uuid,
  fallback_section_id uuid,
  was_public boolean not null,
  created_at timestamptz not null default now()
);
alter table private.slug_redirects enable row level security;
revoke all on table private.slug_redirects from public,anon,authenticated,service_role;
create index slug_redirects_target_idx on private.slug_redirects(target_kind,target_id);

create function public.resolve_taxonomy_redirect(p_source_path text)
returns text language sql stable security definer set search_path='' as $$
  select case r.target_kind
    when 'tag' then coalesce(
      (select '/tags/'||t.slug from public.tags t
        where t.id=r.target_id and private.tag_has_public_articles(t.id)),
      '/search')
    when 'section' then coalesce(
      (select case when s.slug='letter-to-the-editor' then '/letters' else '/sections/'||s.slug end
        from public.sections s where s.id=r.target_id and s.active), '/')
    when 'category' then coalesce(
      (select '/sections/'||s.slug||'/categories/'||c.slug from public.categories c
        join public.sections s on s.id=c.section_id and s.active
        where c.id=r.target_id and c.active),
      (select case when s.slug='letter-to-the-editor' then '/letters' else '/sections/'||s.slug end
        from public.sections s where s.id=r.fallback_section_id and s.active), '/')
    end
  from private.slug_redirects r where r.source_path=p_source_path and r.was_public and length(p_source_path)<=266;
$$;
revoke all on function public.resolve_taxonomy_redirect(text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_taxonomy_redirect(text) to anon,authenticated;

-- A private tag's tombstone reserves its path without exposing the tag.
create index article_revisions_public_tag_history_idx on public.article_revisions
  using gin ((snapshot->'tagIds') jsonb_path_ops)
  where snapshot#>>'{article,status}' in ('published','archived');

create function private.taxonomy_tag_was_public(p_tag_id uuid)
returns boolean language sql stable set search_path='' as $$
  select private.tag_has_public_articles(p_tag_id) or exists(
    select 1 from public.article_revisions r
    where r.snapshot#>>'{article,status}' in ('published','archived')
      and r.snapshot->'tagIds' @> jsonb_build_array(p_tag_id)
  );
$$;
revoke all on function private.taxonomy_tag_was_public(uuid) from public,anon,authenticated,service_role;

-- Privileged slug edits and upgrade migrations must use the same address history.
-- Display name changes keep their existing slug and therefore need no redirect.
create function private.record_taxonomy_slug_change()
returns trigger language plpgsql set search_path='' as $$
declare old_prefix text; new_prefix text; parent_active boolean;
begin
  if old.slug=new.slug then return new; end if;
  if tg_table_name='sections' then
    old_prefix:='/sections/'||old.slug;
    new_prefix:='/sections/'||new.slug;
    if exists(select 1 from private.slug_redirects where source_path=new_prefix)
      or exists(select 1 from public.categories c join private.slug_redirects r
        on r.source_path=new_prefix||'/categories/'||c.slug where c.section_id=old.id) then
      raise unique_violation using message='Retired taxonomy path';
    end if;
    insert into private.slug_redirects(source_path,target_kind,target_id,was_public)
      values(old_prefix,'section',old.id,old.active);
    insert into private.slug_redirects(source_path,target_kind,target_id,fallback_section_id,was_public)
      select old_prefix||'/categories/'||c.slug,'category',c.id,old.id,old.active and c.active
      from public.categories c where c.section_id=old.id;
  elsif tg_table_name='categories' then
    select '/sections/'||s.slug||'/categories/',s.active into old_prefix,parent_active from public.sections s where s.id=old.section_id;
    if exists(select 1 from private.slug_redirects where source_path=old_prefix||new.slug) then
      raise unique_violation using message='Retired taxonomy path';
    end if;
    insert into private.slug_redirects(source_path,target_kind,target_id,fallback_section_id,was_public)
      values(old_prefix||old.slug,'category',old.id,old.section_id,parent_active and old.active);
  else
    if exists(select 1 from private.slug_redirects where source_path='/tags/'||new.slug) then
      raise unique_violation using message='Retired taxonomy path';
    end if;
    insert into private.slug_redirects(source_path,target_kind,target_id,was_public)
      values('/tags/'||old.slug,'tag',old.id,private.taxonomy_tag_was_public(old.id));
  end if;
  return new;
end;
$$;
revoke all on function private.record_taxonomy_slug_change() from public,anon,authenticated,service_role;
create trigger record_section_slug_change before update of slug on public.sections
  for each row execute function private.record_taxonomy_slug_change();
create trigger record_category_slug_change before update of slug on public.categories
  for each row execute function private.record_taxonomy_slug_change();
create trigger record_tag_slug_change before update of slug on public.tags
  for each row execute function private.record_taxonomy_slug_change();

create or replace function private.manage_tag(
  p_operation text, p_id uuid, p_target_id uuid, p_request_id uuid, p_name text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.taxonomy_write_receipts%rowtype; tag public.tags%rowtype;
  target public.tags%rowtype; changed boolean := false; moved integer := 0;
  result jsonb; audit_action text; audit_detail jsonb; affected uuid[]; was_public boolean;
begin
  if p_operation not in ('rename','merge','delete') or p_id is null or p_request_id is null
    or (p_operation = 'rename' and (p_target_id is not null or p_name is null
      or p_name <> pg_catalog.btrim(pg_catalog.regexp_replace(p_name,'[[:space:]]+',' ','g'))
      or pg_catalog.char_length(p_name) not between 1 and 120 or p_name ~ '[[:cntrl:]]'))
    or (p_operation = 'merge' and (p_target_id is null or p_target_id = p_id or p_name is not null))
    or (p_operation = 'delete' and (p_target_id is not null or p_name is not null)) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','tag_'||p_operation,'id',p_id,'target',p_target_id,'name',p_name));
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  -- Same lock as tag creation, so a tag cannot gain a user mid-operation.
  perform pg_catalog.pg_advisory_xact_lock(72300320261112::bigint);
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into receipt from private.taxonomy_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  perform t.id from public.tags t
    where t.id in (p_id,p_target_id) order by t.id for update;
  select * into tag from public.tags where id=p_id;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if p_operation = 'rename' then
    if exists (select 1 from public.tags where id <> p_id
      and pg_catalog.lower(name)=pg_catalog.lower(p_name)) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    if tag.name <> p_name then
      update public.tags set name=p_name where id=p_id;
      changed := true;
    end if;
    audit_action := 'tag.renamed';
  elsif p_operation = 'merge' then
    select * into target from public.tags where id=p_target_id;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    -- Editorial writes lock the article before tags. Do not wait for its row while holding these tag locks.
    select array_agg(articles.id) into affected from (
      select a.id from public.articles a join public.article_tags atg on atg.article_id=a.id
      where a.status='published' and atg.tag_id=p_id order by a.id for update of a nowait
    ) articles;
    if exists(select 1 from public.articles a where a.id=any(affected) and a.edit_version=2147483647) then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    was_public:=private.taxonomy_tag_was_public(p_id);
    insert into public.article_tags(article_id,tag_id)
      select article_id,p_target_id from public.article_tags where tag_id=p_id
      on conflict do nothing;
    delete from public.article_tags where tag_id=p_id;
    get diagnostics moved = row_count;
    update private.slug_redirects set target_id=p_target_id where target_kind='tag' and target_id=p_id;
    insert into private.slug_redirects(source_path,target_kind,target_id,was_public)
      values('/tags/'||tag.slug,'tag',p_target_id,was_public);
    update public.articles set edit_version=edit_version+1 where id=any(affected);
    insert into public.article_revisions(article_id,actor_user_id,snapshot)
      select id,actor,private.capture_draft_snapshot(id) from unnest(affected) id;
    audit_detail:=jsonb_build_object('targetId',p_target_id,'moved',moved,
      'publishedRevisions',coalesce(cardinality(affected),0));
    delete from public.tags where id=p_id;
    changed := true;
    audit_action := 'tag.merged';
  else
    if exists (select 1 from public.article_tags where tag_id=p_id) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    insert into private.slug_redirects(source_path,target_kind,was_public)
      values('/tags/'||tag.slug,'tag',private.taxonomy_tag_was_public(p_id));
    delete from public.tags where id=p_id;
    changed := true;
    audit_action := 'tag.deleted';
    audit_detail:=jsonb_build_object('sourcePath','/tags/'||tag.slug);
  end if;
  if changed then
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id,detail)
      values(actor,audit_action,'tag',p_id,p_request_id,audit_detail);
  end if;
  result := pg_catalog.jsonb_build_object('ok',true,'operation',p_operation,'id',p_id,
    'targetId',p_target_id,'changed',changed,'moved',moved,'replayed',false);
  insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
    values(actor,p_request_id,'tag',p_id,fingerprint,result);
  return result;
exception when unique_violation or lock_not_available then
  return '{"ok":false,"code":"conflict"}'::jsonb;
end;
$$;

create or replace function public.delete_taxonomy(p_kind text, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.taxonomy_write_receipts%rowtype; cat public.categories%rowtype;
  result jsonb; section_slug text; section_active boolean; audit_detail jsonb;
begin
  if p_kind not in ('section','category') or p_id is null or p_request_id is null then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','delete','kind',p_kind,'id',p_id));
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into receipt from private.taxonomy_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if p_kind = 'section' then
    select slug,active into section_slug,section_active from public.sections where id=p_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if section_slug='letter-to-the-editor'
      or exists (select 1 from public.articles where section_id=p_id)
      or exists (select 1 from public.article_categories where section_id=p_id) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    -- Its categories go with it; none is used (checked above).
    insert into private.slug_redirects(source_path,target_kind,was_public)
      values('/sections/'||section_slug,'section',section_active);
    insert into private.slug_redirects(source_path,target_kind,was_public)
      select '/sections/'||section_slug||'/categories/'||c.slug,'category',section_active and c.active
      from public.categories c where c.section_id=p_id;
    audit_detail:=jsonb_build_object('sourcePath','/sections/'||section_slug);
    delete from public.categories where section_id=p_id;
    delete from public.sections where id=p_id;
  else
    select * into cat from public.categories where id=p_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if pg_catalog.lower(cat.name)='outside of bc'
      or exists (select 1 from public.article_categories where category_id=p_id) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    select slug,active into section_slug,section_active from public.sections where id=cat.section_id;
    insert into private.slug_redirects(source_path,target_kind,fallback_section_id,was_public)
      values('/sections/'||section_slug||'/categories/'||cat.slug,'category',cat.section_id,section_active and cat.active);
    audit_detail:=jsonb_build_object('sourcePath','/sections/'||section_slug||'/categories/'||cat.slug);
    delete from public.categories where id=p_id;
  end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id,detail)
    values(actor,p_kind||'.deleted',p_kind,p_id,p_request_id,audit_detail);
  result := pg_catalog.jsonb_build_object('ok',true,'kind',p_kind,'id',p_id,'replayed',false);
  insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
    values(actor,p_request_id,p_kind,p_id,fingerprint,result);
  return result;
exception when foreign_key_violation then
  return '{"ok":false,"code":"conflict"}'::jsonb;
end;
$$;


create or replace function public.create_taxonomy(
  p_kind text, p_request_id uuid, p_name text, p_navigation_order integer,
  p_parent_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.taxonomy_write_receipts%rowtype; base text; candidate text;
  suffix text; n integer; new_id uuid; new_slug text; result jsonb; parent public.sections%rowtype;
begin
  if p_kind not in ('section','category') or p_request_id is null
    or p_name is null or p_name <> pg_catalog.btrim(p_name)
    or pg_catalog.char_length(p_name) not between 1 and 120 or p_name ~ '[[:cntrl:]]'
    or p_navigation_order is null or p_navigation_order < 0
    or (p_kind = 'section' and p_parent_id is not null)
    or (p_kind = 'category' and p_parent_id is null) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  fingerprint := private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','create','kind',p_kind,'name',p_name,'order',p_navigation_order,
    'parent',p_parent_id));
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into receipt from private.taxonomy_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if p_kind = 'section'
    and (select count(*) from public.sections where active) >= 100 then
    return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  base := private.taxonomy_slug_base(p_name);
  if p_kind = 'category' then
    select * into parent from public.sections where id=p_parent_id for share;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if not parent.active then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  end if;
  for n in 1..1000 loop
    suffix := case when n = 1 then '' else '-' || n::text end;
    candidate := pg_catalog.rtrim(pg_catalog.left(base,120 - pg_catalog.char_length(suffix)),'-') || suffix;
    if p_kind = 'section' then
      if private.is_reserved_taxonomy_slug(candidate) then continue; end if;
      if exists (select 1 from public.sections where slug=candidate)
        or exists (select 1 from private.slug_redirects where source_path='/sections/'||candidate)
        then continue; end if;
      insert into public.sections(name,slug,navigation_order)
        values(p_name,candidate,p_navigation_order) returning id,slug into new_id,new_slug;
    else
      if exists (select 1 from public.categories where section_id=p_parent_id and slug=candidate)
        or exists (select 1 from private.slug_redirects where source_path='/sections/'||parent.slug||'/categories/'||candidate)
        then continue; end if;
      insert into public.categories(section_id,name,slug,navigation_order)
        values(p_parent_id,p_name,candidate,p_navigation_order) returning id,slug into new_id,new_slug;
    end if;
    exit;
  end loop;
  if new_id is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,p_kind||'.created',p_kind,new_id,p_request_id);
  result := pg_catalog.jsonb_build_object('ok',true,'kind',p_kind,'id',new_id,
    'slug',new_slug,'replayed',false);
  insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
    values(actor,p_request_id,p_kind,new_id,fingerprint,result);
  return result;
exception when unique_violation then
  -- A section or category with this name already exists.
  return '{"ok":false,"code":"conflict"}'::jsonb;
end;
$$;

create or replace function public.ensure_tag(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_profile uuid;
  today date;
  normalized text;
  base text;
  candidate text;
  suffix text;
  n integer;
  tag public.tags%rowtype;
  created boolean := false;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if not private.consume_draft_attempt(actor) then
    return '{"ok":false,"code":"rate_limited"}'::jsonb;
  end if;
  normalized := trim(regexp_replace(p_name,U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'));
  if normalized is null or char_length(normalized) not between 1 and 120
    or normalized ~ U&'[\0001-\001F\007F-\009F]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  -- One lock covers overlapping slug bases, e.g. "topic" and "topic-2".
  -- A fresh SELECT after the wait sees a concurrent creator's committed row.
  perform pg_catalog.pg_advisory_xact_lock(72300320261112::bigint);
  select * into tag from public.tags where lower(name)=lower(normalized);
  if not found then
    -- The actor lock serializes the per-member debit and the tag lock keeps name reuse atomic.
    today := private.tag_creation_day(clock_timestamp());
    if exists(select 1 from private.member_tag_creation_limits l
      where l.actor_user_id=actor and l.quota_day=today and l.created_count>=30) then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    base := private.taxonomy_slug_base(normalized);
    for n in 1..10000 loop
      suffix := case when n=1 then '' else '-' || n::text end;
      candidate := trim(trailing '-' from left(base,120-char_length(suffix))) || suffix;
      if private.is_reserved_taxonomy_slug(candidate)
        or exists (select 1 from private.slug_redirects where source_path='/tags/'||candidate)
        then continue; end if;
      insert into public.tags(name,slug) values(normalized,candidate)
        on conflict do nothing returning * into tag;
      if found then
        insert into private.member_tag_creation_limits(actor_user_id,quota_day,created_count)
          values(actor,today,1)
          on conflict(actor_user_id) do update set
            quota_day=excluded.quota_day,
            created_count=case when member_tag_creation_limits.quota_day=excluded.quota_day
              then member_tag_creation_limits.created_count+1 else 1 end;
        created := true;
        exit;
      end if;
      select * into tag from public.tags where lower(name)=lower(normalized);
      if found then exit; end if;
    end loop;
  end if;
  if tag.id is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  return jsonb_build_object('ok',true,'id',tag.id,'name',tag.name,'slug',tag.slug,'created',created);
end;
$$;
