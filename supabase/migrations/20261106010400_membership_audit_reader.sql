create index audit_events_recent_membership_idx
on public.audit_events(created_at desc,id desc)
where resource_type='membership';

create function public.list_membership_audit_events(
  p_limit integer default 21,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  event_id uuid,
  action text,
  resource_id uuid,
  created_at timestamptz,
  actor_label text,
  target_email text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_active_administrator() or not exists (
    select 1 from public.profiles where auth_user_id=auth.uid() and active
  ) then
    raise exception 'Administrator access required.' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or ((p_before_at is null) <> (p_before_id is null)) then
    raise exception 'Invalid audit request.' using errcode='22023';
  end if;
  return query
  select e.id,e.action,e.resource_id,e.created_at,
    coalesce(actor_profile.display_name,'Former member')::text,
    coalesce(target_user.email,'')::text
  from public.audit_events e
  left join public.profiles actor_profile on actor_profile.auth_user_id=e.actor_user_id
  left join auth.users target_user on target_user.id=e.resource_id
  where e.resource_type='membership'
    and e.action in ('membership.approved','membership.role_changed',
      'membership.deactivated')
    and (p_before_at is null or (e.created_at,e.id) < (p_before_at,p_before_id))
  order by e.created_at desc,e.id desc
  limit p_limit;
end;
$$;
revoke all on function public.list_membership_audit_events(integer,timestamptz,uuid)
from public,anon,authenticated;
grant execute on function public.list_membership_audit_events(integer,timestamptz,uuid)
to authenticated;
