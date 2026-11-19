-- Administrators create sections and categories and curate tags. Existing
-- rename, reorder and deactivate keep their rules (update_*_taxonomy); stories
-- that use a section or category still block its deactivation.
alter table private.taxonomy_write_receipts
  drop constraint taxonomy_write_receipts_kind_check,
  add constraint taxonomy_write_receipts_kind_check
    check (kind in ('section','category','tag'));

do $$ declare previous_expression text; begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into strict previous_expression
    from pg_catalog.pg_constraint where conrelid='public.audit_events'::regclass
      and conname='audit_events_action_resource_check';
  alter table public.audit_events drop constraint audit_events_action_resource_check;
  execute pg_catalog.format('alter table public.audit_events add constraint audit_events_action_resource_check check ((%s) or (resource_type = %L and action = %L) or (resource_type = %L and action = %L) or (resource_type = %L and action in (%L,%L,%L)))',
    previous_expression,'section','section.created','category','category.created',
    'tag','tag.renamed','tag.merged','tag.deleted');
end $$;

create function public.create_taxonomy(
  p_kind text, p_request_id uuid, p_name text, p_navigation_order integer,
  p_parent_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.taxonomy_write_receipts%rowtype; base text; candidate text;
  suffix text; n integer; new_id uuid; new_slug text; result jsonb;
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
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  select * into receipt from private.taxonomy_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  base := private.article_slug_base(p_name);
  if p_kind = 'category' then
    perform 1 from public.sections where id=p_parent_id for share;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if not exists (select 1 from public.sections where id=p_parent_id and active) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  end if;
  for n in 1..1000 loop
    suffix := case when n = 1 then '' else '-' || n::text end;
    candidate := pg_catalog.rtrim(pg_catalog.left(base,120 - pg_catalog.char_length(suffix)),'-') || suffix;
    if p_kind = 'section' then
      if exists (select 1 from public.sections where slug=candidate) then continue; end if;
      insert into public.sections(name,slug,navigation_order)
        values(p_name,candidate,p_navigation_order) returning id,slug into new_id,new_slug;
    else
      if exists (select 1 from public.categories where section_id=p_parent_id and slug=candidate) then continue; end if;
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

-- Tags: rename (slug stays fixed), merge one into another, delete when unused.
create function private.manage_tag(
  p_operation text, p_id uuid, p_target_id uuid, p_request_id uuid, p_name text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.taxonomy_write_receipts%rowtype; tag public.tags%rowtype;
  target public.tags%rowtype; changed boolean := false; moved integer := 0;
  result jsonb; audit_action text;
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
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  -- Same lock as tag creation, so a tag cannot gain a user mid-operation.
  perform pg_catalog.pg_advisory_xact_lock(72300320261112::bigint);
  select * into receipt from private.taxonomy_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash <> fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select * into tag from public.tags where id=p_id for update;
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
    select * into target from public.tags where id=p_target_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    insert into public.article_tags(article_id,tag_id)
      select article_id,p_target_id from public.article_tags where tag_id=p_id
      on conflict do nothing;
    delete from public.article_tags where tag_id=p_id;
    get diagnostics moved = row_count;
    delete from public.tags where id=p_id;
    changed := true;
    audit_action := 'tag.merged';
  else
    if exists (select 1 from public.article_tags where tag_id=p_id) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    delete from public.tags where id=p_id;
    changed := true;
    audit_action := 'tag.deleted';
  end if;
  if changed then
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,audit_action,'tag',p_id,p_request_id);
  end if;
  result := pg_catalog.jsonb_build_object('ok',true,'operation',p_operation,'id',p_id,
    'targetId',p_target_id,'changed',changed,'moved',moved,'replayed',false);
  insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
    values(actor,p_request_id,'tag',p_id,fingerprint,result);
  return result;
exception when unique_violation then
  return '{"ok":false,"code":"conflict"}'::jsonb;
end;
$$;
revoke all on function private.manage_tag(text,uuid,uuid,uuid,text) from public,anon,authenticated;

create function public.rename_tag(p_id uuid,p_request_id uuid,p_name text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.manage_tag('rename',p_id,null,p_request_id,p_name);
$$;
create function public.merge_tags(p_source_id uuid,p_target_id uuid,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.manage_tag('merge',p_source_id,p_target_id,p_request_id,null);
$$;
create function public.delete_unused_tag(p_id uuid,p_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.manage_tag('delete',p_id,null,p_request_id,null);
$$;

-- Admin tag list: "in use" (shown as referenced_live) is any article association.
create or replace function public.list_admin_taxonomy(p_kind text,p_limit integer default 21,p_after_id uuid default null)
returns table(id uuid,name text,slug text,parent_name text,navigation_order integer,
  active boolean,edit_version integer,referenced_live boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_active_administrator() or not exists(
    select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active
  ) then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('section','category','tag')
    or p_limit is null or p_limit not between 1 and 51 then
    raise exception 'Invalid taxonomy request.' using errcode='22023'; end if;
  if p_kind='section' then
    return query select s.id,s.name,s.slug,null::text,s.navigation_order,s.active,s.edit_version,
      exists(select 1 from public.articles a where a.section_id=s.id and a.status in ('published','archived'))
      from public.sections s where p_after_id is null or s.id>p_after_id order by s.id limit p_limit;
  elsif p_kind='category' then
    return query select c.id,c.name,c.slug,s.name,c.navigation_order,c.active,c.edit_version,
      exists(select 1 from public.article_categories ac join public.articles a on a.id=ac.article_id
        where ac.category_id=c.id and a.status in ('published','archived'))
      from public.categories c join public.sections s on s.id=c.section_id
      where p_after_id is null or c.id>p_after_id order by c.id limit p_limit;
  else
    return query select t.id,t.name,t.slug,null::text,null::integer,null::boolean,null::integer,
      exists(select 1 from public.article_tags atg where atg.tag_id=t.id)
      from public.tags t where p_after_id is null or t.id>p_after_id order by t.id limit p_limit;
  end if;
end;
$$;

revoke all on function public.create_taxonomy(text,uuid,text,integer,uuid),
  public.rename_tag(uuid,uuid,text), public.merge_tags(uuid,uuid,uuid),
  public.delete_unused_tag(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_taxonomy(text,uuid,text,integer,uuid),
  public.rename_tag(uuid,uuid,text), public.merge_tags(uuid,uuid,uuid),
  public.delete_unused_tag(uuid,uuid) to authenticated;
