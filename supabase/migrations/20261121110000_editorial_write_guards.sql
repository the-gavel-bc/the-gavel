-- Check administrator authority before entering the shared write queue.
-- Recheck after waiting, before a receipt can be returned.

create or replace function public.save_homepage_selections(
  p_expected_version integer,p_request_id uuid,p_lead uuid,p_featured uuid[],p_read_this uuid[]
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); all_ids uuid[]; fingerprint text;
  receipt private.homepage_write_receipts%rowtype; current_version integer;
  old_lead uuid; old_featured uuid[]; old_read uuid[]; changed boolean; result jsonb;
begin
  if p_expected_version is null or p_expected_version<1 or p_request_id is null
    or p_featured is null or p_read_this is null
    or coalesce(pg_catalog.array_ndims(p_featured),1)<>1 or coalesce(pg_catalog.array_ndims(p_read_this),1)<>1
    or coalesce(pg_catalog.array_lower(p_featured,1),1)<>1 or coalesce(pg_catalog.array_lower(p_read_this,1),1)<>1
    or pg_catalog.cardinality(p_featured)>4 or pg_catalog.cardinality(p_read_this)>4
    or pg_catalog.array_position(p_featured,null::uuid) is not null
    or pg_catalog.array_position(p_read_this,null::uuid) is not null then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  all_ids:=case when p_lead is null then '{}'::uuid[] else array[p_lead] end || p_featured || p_read_this;
  if (select pg_catalog.count(distinct id) from pg_catalog.unnest(all_ids) id)<>pg_catalog.cardinality(all_ids) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','homepage.save','version',p_expected_version,'lead',p_lead,'featured',p_featured,'readThis',p_read_this));
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=actor and p.active) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=actor and p.active) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  select * into receipt from private.homepage_write_receipts where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  select edit_version into current_version from public.homepage_curation
    where id='00000000-0000-0000-0000-000000000001'::uuid for update;
  if current_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  perform id from public.articles where id=any(all_ids) order by id for share;
  if (select pg_catalog.count(*) from public.articles a where a.id=any(all_ids) and a.status='published')
      <>pg_catalog.cardinality(all_ids) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  select article_id into old_lead from public.homepage_selections where group_name='lead' and position=1;
  select coalesce(pg_catalog.array_agg(s.article_id order by s.position),'{}'::uuid[]) into old_featured
    from public.homepage_selections s where s.group_name='featured';
  select coalesce(pg_catalog.array_agg(s.article_id order by s.position),'{}'::uuid[]) into old_read
    from public.homepage_selections s where s.group_name='read_this';
  changed:=old_lead is distinct from p_lead or old_featured is distinct from p_featured or old_read is distinct from p_read_this;
  if changed and current_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if changed then
    delete from public.homepage_selections where group_name in ('lead','featured','read_this');
    if p_lead is not null then insert into public.homepage_selections(group_name,position,article_id) values('lead',1,p_lead); end if;
    insert into public.homepage_selections(group_name,position,article_id)
      select 'featured',ordinality::integer,id from pg_catalog.unnest(p_featured) with ordinality t(id,ordinality);
    insert into public.homepage_selections(group_name,position,article_id)
      select 'read_this',ordinality::integer,id from pg_catalog.unnest(p_read_this) with ordinality t(id,ordinality);
    update public.homepage_curation set edit_version=edit_version+1
      where id='00000000-0000-0000-0000-000000000001'::uuid returning edit_version into current_version;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'homepage.updated','homepage','00000000-0000-0000-0000-000000000001'::uuid,p_request_id);
  end if;
  result:=pg_catalog.jsonb_build_object('ok',true,'version',current_version,'changed',changed,'replayed',false);
  insert into private.homepage_write_receipts(actor_user_id,request_id,payload_hash,result)
    values(actor,p_request_id,fingerprint,result);
  return result;
exception when others then
  raise log 'homepage curation failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;

create or replace function public.create_taxonomy(
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

create or replace function private.manage_tag(
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

create or replace function private.update_existing_taxonomy(
  p_kind text,p_id uuid,p_expected_version integer,p_request_id uuid,
  p_name text,p_navigation_order integer,p_active boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fingerprint text; receipt private.taxonomy_write_receipts%rowtype;
  section_row public.sections%rowtype; category_row public.categories%rowtype;
  parent_id uuid; current_name text; current_order integer; current_active boolean;
  current_version integer; changed boolean; result jsonb;
begin
  if p_kind not in ('section','category') or p_id is null or p_request_id is null
    or p_expected_version is null or p_expected_version<1 or p_name is null
    or p_name<>pg_catalog.btrim(p_name) or pg_catalog.char_length(p_name) not between 1 and 120
    or p_name ~ '[[:cntrl:]]' or p_navigation_order is null or p_navigation_order<0
    or p_active is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'kind',p_kind,'id',p_id,'expectedVersion',p_expected_version,
    'name',p_name,'order',p_navigation_order,'active',p_active));
  if not private.is_active_administrator() or not exists(
    select 1 from public.profiles p where p.auth_user_id=actor and p.active
  ) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  if not private.is_active_administrator() or not exists(
    select 1 from public.profiles p where p.auth_user_id=actor and p.active
  ) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  select * into receipt from private.taxonomy_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then
      return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;

  if p_kind='section' then
    select * into section_row from public.sections where id=p_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    current_name:=section_row.name; current_order:=section_row.navigation_order;
    current_active:=section_row.active; current_version:=section_row.edit_version;
    if p_active and not current_active
      and (select count(*) from public.sections where active) >= 100 then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    if not p_active and current_active and exists(select 1 from public.articles a
      where a.section_id=p_id and a.status in ('published','archived')) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  else
    select section_id into parent_id from public.categories where id=p_id;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    select * into section_row from public.sections where id=parent_id for share;
    select * into category_row from public.categories where id=p_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    current_name:=category_row.name; current_order:=category_row.navigation_order;
    current_active:=category_row.active; current_version:=category_row.edit_version;
    -- Only activation needs an active parent; edits to an already-active category
    -- under a deactivated section (which always send p_active=true) must still save.
    if p_active and not current_active and not section_row.active then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    if pg_catalog.lower(current_name)='outside of bc' and p_name<>current_name then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    if not p_active and current_active and exists(
      select 1 from public.article_categories c join public.articles a on a.id=c.article_id
      where c.category_id=p_id and a.status in ('published','archived')) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  end if;
  if current_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  changed:=current_name is distinct from p_name or current_order is distinct from p_navigation_order
    or current_active is distinct from p_active;
  if changed and current_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if changed then
    if p_kind='section' then
      update public.sections set name=p_name,navigation_order=p_navigation_order,
        active=p_active,edit_version=edit_version+1 where id=p_id returning edit_version into current_version;
    else
      update public.categories set name=p_name,navigation_order=p_navigation_order,
        active=p_active,edit_version=edit_version+1 where id=p_id returning edit_version into current_version;
    end if;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,p_kind||'.updated',p_kind,p_id,p_request_id);
  end if;
  result:=pg_catalog.jsonb_build_object('ok',true,'kind',p_kind,'id',p_id,
    'version',current_version,'active',p_active,'changed',changed,'replayed',false);
  insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
    values(actor,p_request_id,p_kind,p_id,fingerprint,result);
  return result;
exception when unique_violation then
  return '{"ok":false,"code":"conflict"}'::jsonb;
when others then
  raise log 'taxonomy update failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;

create or replace function public.delete_taxonomy(p_kind text, p_id uuid, p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); fingerprint text;
  receipt private.taxonomy_write_receipts%rowtype; cat public.categories%rowtype;
  result jsonb;
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
    perform 1 from public.sections where id=p_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if exists (select 1 from public.articles where section_id=p_id)
      or exists (select 1 from public.article_categories where section_id=p_id) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    -- Its categories go with it; none is used (checked above).
    delete from public.categories where section_id=p_id;
    delete from public.sections where id=p_id;
  else
    select * into cat from public.categories where id=p_id for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    if pg_catalog.lower(cat.name)='outside of bc'
      or exists (select 1 from public.article_categories where category_id=p_id) then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
    delete from public.categories where id=p_id;
  end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,p_kind||'.deleted',p_kind,p_id,p_request_id);
  result := pg_catalog.jsonb_build_object('ok',true,'kind',p_kind,'id',p_id,'replayed',false);
  insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
    values(actor,p_request_id,p_kind,p_id,fingerprint,result);
  return result;
exception when foreign_key_violation then
  return '{"ok":false,"code":"conflict"}'::jsonb;
end;
$$;


create or replace function public.save_own_public_profile(
  p_expected_version integer,p_request_id uuid,p_display_name text,p_biography text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); profile public.profiles%rowtype;
  receipt private.profile_write_receipts%rowtype; fingerprint text;
  next_slug text; next_version integer; changed boolean; result jsonb;
begin
  if p_expected_version is null or p_expected_version<1 or p_request_id is null
    or p_display_name is null or p_display_name<>pg_catalog.btrim(p_display_name)
    or pg_catalog.char_length(p_display_name) not between 1 and 120
    or p_display_name ~ '[[:cntrl:]]'
    or (p_biography is not null and (pg_catalog.char_length(p_biography)>5000
      or pg_catalog.replace(pg_catalog.replace(p_biography,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
  then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if not exists (
    select 1 from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active
  ) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  select p.* into profile from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active for update of p;
  if not found or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(pg_catalog.jsonb_build_object(
    'operation','save_own','profileId',profile.id,'expectedVersion',p_expected_version,
    'displayName',p_display_name,'biography',p_biography));
  select * into receipt from private.profile_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if profile.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  changed:=profile.display_name is distinct from p_display_name or profile.biography is distinct from p_biography;
  if changed and profile.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  next_slug:=profile.slug; next_version:=profile.edit_version;
  if changed then
    if profile.display_name is distinct from p_display_name and not profile.slug_frozen then
      next_slug:=private.allocate_profile_slug(p_display_name,profile.id);
      if next_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
    end if;
    update public.profiles set display_name=p_display_name,biography=p_biography,
      slug=next_slug,edit_version=edit_version+1 where id=profile.id returning edit_version into next_version;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'profile.updated','profile',profile.id,p_request_id);
  end if;
  result:=pg_catalog.jsonb_build_object('ok',true,'profileId',profile.id,'slug',next_slug,
    'version',next_version,'changed',changed,'replayed',false);
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    values(actor,p_request_id,'save_own',profile.id,fingerprint,result);
  return result;
exception when others then
  raise log 'own profile save failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;

create or replace function public.create_guest_contributor(p_request_id uuid,p_display_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); fingerprint text; profile public.profiles%rowtype;
  receipt private.profile_write_receipts%rowtype; result jsonb; next_slug text;
begin
  if p_request_id is null or p_display_name is null
    or p_display_name<>btrim(p_display_name) or char_length(p_display_name) not between 1 and 120
    or p_display_name ~ '[[:cntrl:]]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() or not exists (
    select 1 from public.profiles p join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active
  ) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  if private.lock_draft_actor() is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(jsonb_build_object(
    'operation','create_guest_author','displayName',p_display_name));
  select * into receipt from private.profile_write_receipts
    where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  -- Always a new credit-only row: a one-off credit is never matched to, or
  -- shared with, another person or article by name.
  next_slug:=private.allocate_profile_slug(p_display_name,null::uuid);
  if next_slug is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  insert into public.profiles(display_name,slug) values(p_display_name,next_slug) returning * into profile;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,'profile.created','profile',profile.id,p_request_id);
  result:=jsonb_build_object('ok',true,'id',profile.id,'displayName',profile.display_name,
    'slug',profile.slug,'created',true,'replayed',false);
  insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    values(actor,p_request_id,'create_guest_author',profile.id,fingerprint,result);
  return result;
end;
$$;
