-- The singleton and taxonomy tables retain their existing grants. This RPC
-- publishes only the intended fields and fails rather than truncating menus.
create or replace function public.get_public_site_navigation()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare navigation jsonb; information jsonb;
begin
  if (select count(*) from (select 1 from public.sections s where s.active limit 101) bounded)>100
    or (select count(*) from (
      select 1 from public.categories c join public.sections s on s.id=c.section_id
      where c.active and s.active limit 1001
    ) bounded)>1000 then
    return jsonb_build_object('kind','unavailable');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name',s.name,'slug',s.slug,
    'categories',(select coalesce(jsonb_agg(jsonb_build_object('name',c.name,'slug',c.slug)
      order by c.navigation_order,c.slug),'[]'::jsonb)
      from public.categories c where c.section_id=s.id and c.active))
    order by s.navigation_order,s.slug),'[]'::jsonb)
    into navigation from public.sections s where s.active;

  -- Treat legacy or externally modified unsafe values as unset at the public boundary.
  select jsonb_build_object(
    'mission',case when char_length(si.mission) between 1 and 5000
      and si.mission !~ '[<>]'
      and replace(replace(si.mission,E'\n',''),E'\t','') !~ '[[:cntrl:]]' then si.mission else null end,
    'contactEmail',case when char_length(si.contact_email) <= 254 and si.contact_email ~
      '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
      and char_length(split_part(si.contact_email,'@',1)) <= 64
      and split_part(si.contact_email,'@',1) !~ '(^\.|\.\.|\.$)'
      and not exists (
        select 1 from unnest(string_to_array(split_part(si.contact_email,'@',2),'.')) label
        where label !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$'
      ) then si.contact_email else null end,
    'instagramUrl',case when char_length(si.instagram_url) <= 255 and si.instagram_url ~
      '^https://(www\.)?instagram\.com/[A-Za-z0-9._/]+$' then si.instagram_url else null end,
    'submissionInstructions',case when char_length(si.submission_instructions) between 1 and 5000
      and si.submission_instructions !~ '[<>]'
      and replace(replace(si.submission_instructions,E'\n',''),E'\t','') !~ '[[:cntrl:]]'
      then si.submission_instructions else null end)
    into information from public.site_information si
    where si.id='00000000-0000-0000-0000-000000000002'::uuid;

  return jsonb_build_object('kind','ok','sections',navigation,'information',
    coalesce(information,jsonb_build_object('mission',null,'contactEmail',null,'instagramUrl',null,'submissionInstructions',null)));
end;
$$;
revoke all on function public.get_public_site_navigation() from public,anon,authenticated;
grant execute on function public.get_public_site_navigation() to anon,authenticated;
