alter table public.homepage_selections add constraint homepage_selections_article_unique unique(article_id);

create function public.save_homepage_selections(
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
    delete from public.homepage_selections;
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
revoke all on function public.save_homepage_selections(integer,uuid,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.save_homepage_selections(integer,uuid,uuid,uuid[],uuid[]) to authenticated;
