create or replace function public.list_membership_candidates(
  p_limit integer default 21,
  p_state text default 'all',
  p_before_email text default null,
  p_before_user_id uuid default null
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role public.app_role,
  state text,
  edit_version integer,
  eligible boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active
  ) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or p_state is null or p_state not in ('all','pending','active','inactive')
    or ((p_before_email is null) <> (p_before_user_id is null))
    or (p_before_email is not null and (
      pg_catalog.char_length(p_before_email) > 255
      or p_before_email <> pg_catalog.lower(p_before_email))) then
    raise exception 'Invalid membership list request.' using errcode='22023';
  end if;
  return query
  select u.id,coalesce(u.email,'')::text,p.display_name,
    m.role,case when m.user_id is null then 'pending'
      when m.active then 'active' else 'inactive' end::text,
    m.edit_version,
    (u.email_confirmed_at is not null
      and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
      and (u.raw_app_meta_data ->> 'provider'='google'
        or u.raw_app_meta_data -> 'providers' ? 'google'))
  from auth.users u
  left join public.memberships m on m.user_id=u.id
  left join public.profiles p on p.auth_user_id=u.id
  where (m.user_id is not null or (
      u.email_confirmed_at is not null
      and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
      and (u.raw_app_meta_data ->> 'provider'='google'
        or u.raw_app_meta_data -> 'providers' ? 'google')))
    and (p_state='all' or
      (p_state='pending' and m.user_id is null) or
      (p_state='active' and m.active) or
      (p_state='inactive' and m.user_id is not null and not m.active))
    and (p_before_email is null or
      (coalesce(pg_catalog.lower(u.email),'') collate "C",u.id)
        > (p_before_email collate "C",p_before_user_id))
  order by coalesce(pg_catalog.lower(u.email),'') collate "C",u.id
  limit p_limit;
end;
$$;
revoke all on function public.list_membership_candidates(integer,text,text,uuid)
from public,anon,authenticated;
grant execute on function public.list_membership_candidates(integer,text,text,uuid)
to authenticated;
