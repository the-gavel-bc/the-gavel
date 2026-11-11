-- Slots must use the same eligibility as private.homepage_card_map, which
-- returns null for the whole page when any requested card cannot render.
-- Ineligible picks (inactive section/owner, unfinalized main image) now fall
-- through to the next published story instead of failing the homepage.
create function private.is_homepage_card_eligible(p_article_id uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(
    select 1 from public.articles a
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles p on p.id=a.owner_profile_id and p.active
    where a.id=p_article_id and a.status='published'
      and not exists(select 1 from public.article_main_images ami where ami.article_id=a.id
        and not exists(select 1 from public.media_assets m where m.id=ami.asset_id
          and m.article_id=a.id and m.status='finalized')));
$$;
revoke all on function private.is_homepage_card_eligible(uuid) from public,anon,authenticated;

create or replace function private.resolve_homepage_slots()
returns table(lead_id uuid,featured_ids uuid[],read_ids uuid[])
language plpgsql stable set search_path='' as $$
declare chosen record; used uuid[]:='{}'::uuid[]; candidate uuid;
begin
  featured_ids:='{}'; read_ids:='{}';
  for chosen in select s.group_name,s.article_id from public.homepage_selections s
    where private.is_homepage_card_eligible(s.article_id)
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
      and private.is_homepage_card_eligible(a.id)
      order by a.published_at desc,a.id desc limit 1;
    if candidate is not null then lead_id:=candidate; used:=array_append(used,candidate); end if;
  end if;
  while cardinality(featured_ids)<4 loop
    select a.id into candidate from public.articles a where a.status='published' and not(a.id=any(used))
      and private.is_homepage_card_eligible(a.id)
      order by a.published_at desc,a.id desc limit 1;
    exit when candidate is null;
    featured_ids:=array_append(featured_ids,candidate); used:=array_append(used,candidate);
  end loop;
  while cardinality(read_ids)<4 loop
    select a.id into candidate from public.articles a where a.status='published' and not(a.id=any(used))
      and private.is_homepage_card_eligible(a.id)
      order by a.published_at desc,a.id desc limit 1;
    exit when candidate is null;
    read_ids:=array_append(read_ids,candidate); used:=array_append(used,candidate);
  end loop;
  return next;
end;
$$;
revoke all on function private.resolve_homepage_slots() from public,anon,authenticated;
