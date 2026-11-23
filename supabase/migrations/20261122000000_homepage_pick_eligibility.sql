-- Use public-card eligibility for administrator picks and the story library.
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
  if exists (select 1 from pg_catalog.unnest(all_ids) ids(id)
    where not private.is_homepage_card_eligible(ids.id)) then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
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

create function public.list_homepage_eligible_stories(
  p_limit integer, p_search text default null,
  p_before_updated_at timestamptz default null, p_before_id uuid default null
) returns table(id uuid, title text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active
  ) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 13
    or (p_before_updated_at is null) <> (p_before_id is null)
    or (p_before_updated_at is not null and not pg_catalog.isfinite(p_before_updated_at))
    or (p_search is not null and (pg_catalog.char_length(p_search) not between 1 and 80
      or p_search ~ U&'[\0001-\001F\007F-\009F]')) then
    raise exception 'Invalid homepage library request.' using errcode='22023';
  end if;
  return query
    select a.id,a.title,a.updated_at
    from public.articles a
    where a.status='published'
      and (p_before_id is null or (a.updated_at,a.id)<(p_before_updated_at,p_before_id))
      and (p_search is null or pg_catalog.strpos(pg_catalog.lower(a.title),pg_catalog.lower(p_search))>0)
      and private.is_homepage_card_eligible(a.id)
    order by a.updated_at desc,a.id desc limit p_limit;
end;
$$;
revoke all on function public.list_homepage_eligible_stories(integer,text,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.list_homepage_eligible_stories(integer,text,timestamptz,uuid)
  to authenticated;

create or replace function public.get_public_homepage()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare lead_id uuid; featured uuid[]; read_this uuid[]; latest uuid[]; all_ids uuid[];
  groups jsonb; cards jsonb; group_ids uuid[];
begin
  if (select count(*) from (select 1 from public.sections where active limit 101) s)>100 then
    return jsonb_build_object('kind','unavailable');
  end if;
  select r.lead_id,r.featured_ids,r.read_ids into lead_id,featured,read_this from private.resolve_homepage_slots() r;
  select coalesce(array_agg(t.id order by t.published_at desc,t.id desc),'{}'::uuid[]) into latest
    from (select a.id,a.published_at from public.articles a
      where a.status='published' and a.id is distinct from lead_id
        and private.is_homepage_card_eligible(a.id)
      order by a.published_at desc,a.id desc limit 3) t;
  select coalesce(jsonb_agg(jsonb_build_object('name',s.name,'slug',s.slug,'ids',
    (select coalesce(jsonb_agg(t.id order by t.published_at desc,t.id desc),'[]'::jsonb)
      from (select a.id,a.published_at from public.articles a
        where a.section_id=s.id and a.status='published' and private.is_homepage_card_eligible(a.id)
        order by a.published_at desc,a.id desc limit 4) t))
    order by s.navigation_order,s.slug),'[]'::jsonb)
    into groups from public.sections s where s.active;
  select coalesce(array_agg(id::uuid),'{}'::uuid[]) into group_ids
    from jsonb_array_elements(groups) g cross join lateral jsonb_array_elements_text(g->'ids') id;
  all_ids:=case when lead_id is null then '{}'::uuid[] else array[lead_id] end||featured||read_this||latest||group_ids;
  cards:=private.homepage_card_map(all_ids);
  if cards is null then return jsonb_build_object('kind','unavailable'); end if;
  return jsonb_build_object('kind','ok',
    'lead',case when lead_id is null then null else cards->lead_id::text end,
    'featured',coalesce((select jsonb_agg(cards->id::text order by n) from unnest(featured) with ordinality t(id,n)),'[]'::jsonb),
    'readThis',coalesce((select jsonb_agg(cards->id::text order by n) from unnest(read_this) with ordinality t(id,n)),'[]'::jsonb),
    'latest',coalesce((select jsonb_agg(cards->id::text order by n) from unnest(latest) with ordinality t(id,n)),'[]'::jsonb),
    'sections',coalesce((select jsonb_agg(jsonb_build_object('name',g->>'name','slug',g->>'slug','articles',
      coalesce((select jsonb_agg(cards->id order by n) from jsonb_array_elements_text(g->'ids') with ordinality t(id,n)),'[]'::jsonb)) order by ord)
      from jsonb_array_elements(groups) with ordinality t(g,ord)),'[]'::jsonb));
end;
$$;
