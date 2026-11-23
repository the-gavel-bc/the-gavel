-- Upgrade the named legacy section in place. The redirect trigger preserves both
-- its old section URL and inherited category addresses without changing any IDs.
do $$
declare canonical_id uuid; legacy_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  select id into canonical_id from public.sections where slug='letter-to-the-editor' for update;
  select id into legacy_id from public.sections where pg_catalog.lower(name)='letter to the editor' for update;
  if canonical_id is not null and legacy_id is not null and canonical_id<>legacy_id then
    raise exception 'Resolve the conflicting Letters sections before applying this migration.';
  end if;
  if canonical_id is null and legacy_id is not null then
    update public.sections set slug='letter-to-the-editor' where id=legacy_id;
  elsif canonical_id is null then
    insert into public.sections(name,slug,active,navigation_order)
      values('Letter to the Editor','letter-to-the-editor',false,6);
  end if;
end;
$$;

create function private.guard_letters_section_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.slug='letter-to-the-editor' and
    (tg_op='DELETE' or old.slug is distinct from new.slug or old.name is distinct from new.name) then
    raise check_violation using message='The Letters section identity is fixed.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_letters_section_identity() from public,anon,authenticated,service_role;
create trigger guard_letters_section_identity before update of slug,name or delete on public.sections
  for each row execute function private.guard_letters_section_identity();

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
    if section_row.slug='letter-to-the-editor' and p_name<>section_row.name then
      return '{"ok":false,"code":"conflict"}'::jsonb; end if;
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
