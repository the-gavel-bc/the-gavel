-- Resolve all saved picks before allocating fallback slots. Invoked only by
-- checked public/admin projections; never grant application access to helpers.
create or replace function private.resolve_homepage_slots()
returns table(lead_id uuid,featured_ids uuid[],read_ids uuid[])
language plpgsql stable set search_path='' as $$
declare chosen record; used uuid[]:='{}'::uuid[]; candidate uuid;
begin
  featured_ids:='{}'; read_ids:='{}';
  for chosen in select s.group_name,s.article_id from public.homepage_selections s
    join public.articles a on a.id=s.article_id and a.status='published'
    order by case s.group_name when 'lead' then 0 when 'featured' then 1 else 2 end,s.position
  loop
    if chosen.article_id=any(used) then continue; end if;
    if chosen.group_name='lead' and lead_id is null then lead_id:=chosen.article_id;
    elsif chosen.group_name='featured' and cardinality(featured_ids)<4 then featured_ids:=array_append(featured_ids,chosen.article_id);
    elsif chosen.group_name='read_this' and cardinality(read_ids)<4 then read_ids:=array_append(read_ids,chosen.article_id);
    else continue; end if;
    used:=array_append(used,chosen.article_id);
  end loop;
  if lead_id is null then
    select a.id into candidate from public.articles a where a.status='published' and not(a.id=any(used))
      order by a.published_at desc,a.id desc limit 1;
    if candidate is not null then lead_id:=candidate; used:=array_append(used,candidate); end if;
  end if;
  while cardinality(featured_ids)<4 loop
    select a.id into candidate from public.articles a where a.status='published' and not(a.id=any(used))
      order by a.published_at desc,a.id desc limit 1;
    exit when candidate is null;
    featured_ids:=array_append(featured_ids,candidate); used:=array_append(used,candidate);
  end loop;
  while cardinality(read_ids)<4 loop
    select a.id into candidate from public.articles a where a.status='published' and not(a.id=any(used))
      order by a.published_at desc,a.id desc limit 1;
    exit when candidate is null;
    read_ids:=array_append(read_ids,candidate); used:=array_append(used,candidate);
  end loop;
  return next;
end;
$$;
revoke all on function private.resolve_homepage_slots() from public,anon,authenticated;

create or replace function private.homepage_card_map(p_ids uuid[])
returns jsonb language plpgsql stable set search_path='' as $$
declare cards jsonb; bad boolean; expected integer;
begin
  if p_ids is null or cardinality(p_ids)>412 then return null; end if;
  select count(distinct id) into expected from unnest(p_ids) id;
  with requested as (select distinct id from unnest(p_ids) id),
  rows as (
    select a.id,a.slug,a.title,a.excerpt,a.published_at,s.name section_name,s.slug section_slug,
      p.display_name owner_name,p.slug owner_slug,
      (select coalesce(jsonb_agg(w.value order by w.display_order,w.slug),'[]'::jsonb)
       from (select ac.display_order,cp.slug,jsonb_build_object('displayName',cp.display_name,'slug',cp.slug) value
        from public.article_contributors ac join public.profiles cp on cp.id=ac.profile_id and cp.active
        where ac.article_id=a.id and ac.contribution_role='writer'
        order by ac.display_order,cp.slug limit 33) w) writers,
      (select jsonb_build_object('id',m.id,'width',m.width,'height',m.height,'alt',ami.alt_text,'credit',ami.credit)
       from public.article_main_images ami join public.media_assets m
        on m.id=ami.asset_id and m.article_id=ami.article_id and m.status='finalized'
       where ami.article_id=a.id) main_image,
      exists(select 1 from public.article_main_images ami where ami.article_id=a.id
        and not exists(select 1 from public.media_assets m where m.id=ami.asset_id and m.article_id=a.id and m.status='finalized')) bad_image
    from requested r join public.articles a on a.id=r.id and a.status='published'
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles p on p.id=a.owner_profile_id and p.active
  )
  select coalesce(jsonb_object_agg(r.id::text,jsonb_build_object(
    'id',r.id,'slug',r.slug,'title',r.title,'excerpt',r.excerpt,
    'publishedAt',to_char(r.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'section',jsonb_build_object('name',r.section_name,'slug',r.section_slug),
    'owner',jsonb_build_object('displayName',r.owner_name,'slug',r.owner_slug),
    'writers',r.writers,'mainImage',r.main_image)),'{}'::jsonb),
    coalesce(bool_or(r.bad_image or char_length(r.owner_slug)>180 or jsonb_array_length(r.writers)>32
      or exists(select 1 from jsonb_array_elements(r.writers) w where char_length(w->>'slug')>180)),false)
  into cards,bad from rows r;
  if bad or (select count(*) from jsonb_object_keys(cards))<>expected then return null; end if;
  return cards;
end;
$$;
revoke all on function private.homepage_card_map(uuid[]) from public,anon,authenticated;
