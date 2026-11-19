-- Administrators can delete a section or category nothing uses. Anything a
-- story (of any status) references is protected; deactivate it instead.
do $$ declare previous_expression text; begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into strict previous_expression
    from pg_catalog.pg_constraint where conrelid='public.audit_events'::regclass
      and conname='audit_events_action_resource_check';
  alter table public.audit_events drop constraint audit_events_action_resource_check;
  execute pg_catalog.format('alter table public.audit_events add constraint audit_events_action_resource_check check ((%s) or (resource_type = %L and action = %L) or (resource_type = %L and action = %L))',
    previous_expression,'section','section.deleted','category','category.deleted');
end $$;

create function public.delete_taxonomy(p_kind text, p_id uuid, p_request_id uuid)
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

-- "In use" means any story uses the item, whatever its status (deletion rule).
drop function public.list_admin_taxonomy(text,integer,uuid);
create function public.list_admin_taxonomy(p_kind text,p_limit integer default 21,p_after_id uuid default null)
returns table(id uuid,name text,slug text,parent_name text,navigation_order integer,
  active boolean,edit_version integer,referenced_live boolean,in_use boolean)
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
      exists(select 1 from public.articles a where a.section_id=s.id and a.status in ('published','archived')),
      exists(select 1 from public.articles a where a.section_id=s.id)
        or exists(select 1 from public.article_categories ac where ac.section_id=s.id)
      from public.sections s where p_after_id is null or s.id>p_after_id order by s.id limit p_limit;
  elsif p_kind='category' then
    return query select c.id,c.name,c.slug,s.name,c.navigation_order,c.active,c.edit_version,
      exists(select 1 from public.article_categories ac join public.articles a on a.id=ac.article_id
        where ac.category_id=c.id and a.status in ('published','archived')),
      exists(select 1 from public.article_categories ac where ac.category_id=c.id)
        or pg_catalog.lower(c.name)='outside of bc'
      from public.categories c join public.sections s on s.id=c.section_id
      where p_after_id is null or c.id>p_after_id order by c.id limit p_limit;
  else
    return query select t.id,t.name,t.slug,null::text,null::integer,null::boolean,null::integer,
      exists(select 1 from public.article_tags atg where atg.tag_id=t.id),
      exists(select 1 from public.article_tags atg where atg.tag_id=t.id)
      from public.tags t where p_after_id is null or t.id>p_after_id order by t.id limit p_limit;
  end if;
end;
$$;
revoke all on function public.list_admin_taxonomy(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.list_admin_taxonomy(text,integer,uuid) to authenticated;
revoke all on function public.delete_taxonomy(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_taxonomy(text,uuid,uuid) to authenticated;
