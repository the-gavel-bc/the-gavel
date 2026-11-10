create function public.get_public_homepage()
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
      join public.sections s on s.id=a.section_id and s.active
      join public.profiles p on p.id=a.owner_profile_id and p.active
      where a.status='published' and a.id is distinct from lead_id
      order by a.published_at desc,a.id desc limit 3) t;
  select coalesce(jsonb_agg(jsonb_build_object('name',s.name,'slug',s.slug,'ids',
    (select coalesce(jsonb_agg(t.id order by t.published_at desc,t.id desc),'[]'::jsonb)
      from (select a.id,a.published_at from public.articles a
        join public.profiles p on p.id=a.owner_profile_id and p.active
        where a.section_id=s.id and a.status='published'
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
revoke all on function public.get_public_homepage() from public,anon,authenticated;
grant execute on function public.get_public_homepage() to anon,authenticated;
