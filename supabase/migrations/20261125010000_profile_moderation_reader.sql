-- The moderation panel read profiles.edit_version and public_page_hidden
-- directly, but authenticated has no column grant on either, so the read
-- always failed. Read through an administrator-only function instead of
-- widening the column grants to every staff member.
create function public.get_member_profile_moderation(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_user_id is null then return null; end if;
  if not private.is_active_administrator() then return null; end if;
  select jsonb_build_object('version',p.edit_version,'hidden',p.public_page_hidden)
    into result from public.profiles p
    where p.auth_user_id=p_user_id
      and exists(select 1 from public.memberships m where m.user_id=p_user_id);
  return result;
end;
$$;
revoke all on function public.get_member_profile_moderation(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_member_profile_moderation(uuid) to authenticated;
