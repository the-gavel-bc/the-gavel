-- Optional Spotify, LinkedIn and Facebook links for Stay Connected and the
-- footer (owner-approved 2026-11-11). Each is limited to its official HTTPS host.
alter table public.site_information
  add column spotify_url text, add column linkedin_url text, add column facebook_url text;

create function private.is_valid_social_url(p_kind text,p_url text)
returns boolean language sql immutable set search_path='' as $$
  select p_url is not null and char_length(p_url)<=255 and case p_kind
    when 'spotify' then p_url ~ '^https://open\.spotify\.com/[A-Za-z0-9._/-]+$'
    when 'linkedin' then p_url ~ '^https://(www\.)?linkedin\.com/(company|school|showcase|in)/[A-Za-z0-9._%-]+/?$'
    when 'facebook' then p_url ~ '^https://(www\.)?facebook\.com/[A-Za-z0-9._/-]+$'
    else false end;
$$;
revoke all on function private.is_valid_social_url(text,text) from public,anon,authenticated;

-- Return shapes and arity change, so replace rather than overload (PostgREST
-- cannot choose between overloads with the same named arguments).
drop function public.get_site_information();
create function public.get_site_information()
returns table(edit_version integer,mission text,contact_email text,instagram_url text,submission_instructions text,
  spotify_url text,linkedin_url text,facebook_url text)
language sql stable security definer set search_path='' as $$
  select s.edit_version,s.mission,s.contact_email,s.instagram_url,s.submission_instructions,
    s.spotify_url,s.linkedin_url,s.facebook_url
  from public.site_information s where private.is_active_administrator()
    and exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.active);
$$;

drop function public.save_site_information(integer,uuid,text,text,text,text);
create function public.save_site_information(p_expected_version integer,p_request_id uuid,
  p_mission text,p_contact_email text,p_instagram_url text,p_submission_instructions text,
  p_spotify_url text,p_linkedin_url text,p_facebook_url text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_row public.site_information%rowtype;
  receipt private.site_information_receipts%rowtype; fingerprint text; changed boolean; result jsonb;
begin
  if p_expected_version is null or p_expected_version<1 or p_request_id is null
    or (p_mission is not null and (char_length(p_mission) not between 1 and 5000
      or p_mission ~ '[<>]' or replace(replace(p_mission,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
    or (p_submission_instructions is not null and (char_length(p_submission_instructions) not between 1 and 5000
      or p_submission_instructions ~ '[<>]' or replace(replace(p_submission_instructions,E'\n',''),E'\t','') ~ '[[:cntrl:]]'))
    or (p_contact_email is not null and not private.is_valid_contact_email(p_contact_email))
    or (p_instagram_url is not null and (char_length(p_instagram_url)>255 or p_instagram_url !~
      '^https://(www\.)?instagram\.com/[A-Za-z0-9._/]+$'))
    or (p_spotify_url is not null and not private.is_valid_social_url('spotify',p_spotify_url))
    or (p_linkedin_url is not null and not private.is_valid_social_url('linkedin',p_linkedin_url))
    or (p_facebook_url is not null and not private.is_valid_social_url('facebook',p_facebook_url))
  then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if actor is null or not private.has_eligible_identity() then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=actor and p.active) then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  fingerprint:=private.membership_payload_hash(pg_catalog.jsonb_build_object('operation','site_information.save',
    'version',p_expected_version,'mission',p_mission,'email',p_contact_email,
    'instagram',p_instagram_url,'instructions',p_submission_instructions,
    'spotify',p_spotify_url,'linkedin',p_linkedin_url,'facebook',p_facebook_url));
  select * into receipt from private.site_information_receipts where actor_user_id=actor and request_id=p_request_id for update;
  if found then
    if receipt.payload_hash<>fingerprint then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
    return pg_catalog.jsonb_set(receipt.result,'{replayed}','true'::jsonb);
  end if;
  select * into current_row from public.site_information where id='00000000-0000-0000-0000-000000000002'::uuid for update;
  if current_row.edit_version<>p_expected_version then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  changed:=current_row.mission is distinct from p_mission or current_row.contact_email is distinct from p_contact_email
    or current_row.instagram_url is distinct from p_instagram_url or current_row.submission_instructions is distinct from p_submission_instructions
    or current_row.spotify_url is distinct from p_spotify_url or current_row.linkedin_url is distinct from p_linkedin_url
    or current_row.facebook_url is distinct from p_facebook_url;
  if changed and current_row.edit_version=2147483647 then return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if changed then
    update public.site_information set mission=p_mission,contact_email=p_contact_email,instagram_url=p_instagram_url,
      submission_instructions=p_submission_instructions,spotify_url=p_spotify_url,
      linkedin_url=p_linkedin_url,facebook_url=p_facebook_url,edit_version=edit_version+1
      where id=current_row.id returning edit_version into current_row.edit_version;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'site_information.updated','site_information',current_row.id,p_request_id);
  end if;
  result:=pg_catalog.jsonb_build_object('ok',true,'version',current_row.edit_version,'changed',changed,'replayed',false);
  insert into private.site_information_receipts(actor_user_id,request_id,payload_hash,result)
    values(actor,p_request_id,fingerprint,result);
  return result;
exception when others then
  raise log 'site information save failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;

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
    'spotifyUrl',case when private.is_valid_social_url('spotify',si.spotify_url) then si.spotify_url else null end,
    'linkedinUrl',case when private.is_valid_social_url('linkedin',si.linkedin_url) then si.linkedin_url else null end,
    'facebookUrl',case when private.is_valid_social_url('facebook',si.facebook_url) then si.facebook_url else null end,
    'submissionInstructions',case when char_length(si.submission_instructions) between 1 and 5000
      and si.submission_instructions !~ '[<>]'
      and replace(replace(si.submission_instructions,E'\n',''),E'\t','') !~ '[[:cntrl:]]'
      then si.submission_instructions else null end)
    into information from public.site_information si
    where si.id='00000000-0000-0000-0000-000000000002'::uuid;

  return jsonb_build_object('kind','ok','sections',navigation,'information',
    coalesce(information,jsonb_build_object('mission',null,'contactEmail',null,'instagramUrl',null,
      'spotifyUrl',null,'linkedinUrl',null,'facebookUrl',null,'submissionInstructions',null)));
end;
$$;

revoke all on function public.get_site_information(),
  public.save_site_information(integer,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.get_site_information(),
  public.save_site_information(integer,uuid,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.get_public_site_navigation() from public,anon,authenticated;
grant execute on function public.get_public_site_navigation() to anon,authenticated;
notify pgrst,'reload schema';
