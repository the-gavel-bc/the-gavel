begin;
select no_plan();
update auth.users set email='member-audit-' || right(id::text,1) || '@bc.edu',
  email_confirmed_at=now(),raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004');
update public.memberships set role='editor'
where user_id='00000000-0000-0000-0000-000000000003';
insert into public.audit_events(id,actor_user_id,action,resource_type,resource_id,created_at)
values('70000000-0000-0000-0000-000000000095',
  '00000000-0000-0000-0000-000000000004','membership.approved','membership',
  '00000000-0000-0000-0000-000000000002','2030-01-01T00:00:00Z');
insert into private.membership_invitations(id,email,role,invited_by,removed_at)
values('70000000-0000-0000-0000-000000000096','member-audit-2@bc.edu','author',
  '00000000-0000-0000-0000-000000000004',now());
insert into public.audit_events(actor_user_id,action,resource_type,resource_id)
values('00000000-0000-0000-0000-000000000004','membership.invited','membership',
  '70000000-0000-0000-0000-000000000096');

select has_function('public','list_membership_audit_events',
  array['integer','timestamp with time zone','uuid','uuid'],'member audit reader exists');
select has_function('public','list_membership_audit_events_v2',
  array['integer','timestamp with time zone','uuid','uuid'],
  'versioned member audit reader exposes role details');
select ok(not has_function_privilege('anon',
  'public.list_membership_audit_events(integer,timestamp with time zone,uuid,uuid)',
  'EXECUTE'),'anonymous cannot call member audit reader');
select ok(not has_function_privilege('anon',
  'public.list_membership_audit_events_v2(integer,timestamp with time zone,uuid,uuid)',
  'EXECUTE'),'anonymous cannot call versioned member audit reader');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select throws_ok($$select * from public.list_membership_audit_events()$$,
  '42501',null,'author cannot read membership events');
select throws_ok($$select * from public.list_membership_audit_events_v2()$$,
  '42501',null,'author cannot read detailed membership events');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000002401','author')->>'code'),
  'forbidden','author cannot change an administrator role');
select is((public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000002402')->>'code'),
  'forbidden','author cannot deactivate an administrator');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((public.change_membership_role('00000000-0000-0000-0000-000000000003',1,
  '80000000-0000-0000-0000-000000002403','author')->>'ok'),
  'true','administrator may change an editor target role');
select is((public.deactivate_membership('00000000-0000-0000-0000-000000000003',2,
  '80000000-0000-0000-0000-000000002404')->>'ok'),
  'true','administrator may deactivate an editor target');
select ok((select not active and role='author' from public.memberships
  where user_id='00000000-0000-0000-0000-000000000003'),
  'editor target changes persist with final audit state');
select is((select count(*)::integer from public.audit_events where actor_user_id=
  '00000000-0000-0000-0000-000000000004' and resource_id='00000000-0000-0000-0000-000000000003'
  and action in ('membership.role_changed','membership.deactivated')),2,
  'editor target changes emit one audit each');
select is((select detail from public.audit_events where actor_user_id=
  '00000000-0000-0000-0000-000000000004' and resource_id='00000000-0000-0000-0000-000000000003'
  and action='membership.role_changed'),
  '{"previousRole":"editor","newRole":"author"}'::jsonb,
  'role-change detail distinguishes the previous and new role');
select is((select detail from public.audit_events where actor_user_id=
  '00000000-0000-0000-0000-000000000004' and resource_id='00000000-0000-0000-0000-000000000003'
  and action='membership.deactivated'),'{"role":"author"}'::jsonb,
  'deactivation detail preserves the role held');
select is((select actor_label from public.list_membership_audit_events()
  where event_id='70000000-0000-0000-0000-000000000095'),
  'Administrator','reader uses safe actor name');
select is((select target_email from public.list_membership_audit_events()
  where event_id='70000000-0000-0000-0000-000000000095'),
  'member-audit-2@bc.edu','reader uses safe target email');
select is((select pg_catalog.to_jsonb(e)->'detail'
  from public.list_membership_audit_events() e
  where event_id='70000000-0000-0000-0000-000000000095'),null,
  'legacy audit reader keeps its old response shape');
select is((select detail from public.list_membership_audit_events_v2()
  where event_id='70000000-0000-0000-0000-000000000095'),null,
  'legacy rows remain readable with null detail');
reset role;
insert into public.audit_events(actor_user_id,action,resource_type,resource_id,detail)
values('00000000-0000-0000-0000-000000000004','membership.reactivated','membership',
  '00000000-0000-0000-0000-000000000003',
  '{"previousRole":"editor","newRole":"administrator"}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from public.list_membership_audit_events()
  where action='membership.reactivated'),0,
  'legacy reader omits the new action until clients use v2');
select is((select detail from public.list_membership_audit_events_v2()
  where action='membership.reactivated' and resource_id='00000000-0000-0000-0000-000000000003'
  limit 1),'{"previousRole":"editor","newRole":"administrator"}'::jsonb,
  'versioned reader returns new action details');
select is((select count(*)::integer from public.list_membership_audit_events_v2(
  50,null,null,'00000000-0000-0000-0000-000000000003')),
  3,'versioned reader scopes membership and reactivation history to one subject');
select is((select count(*)::integer from public.list_membership_audit_events_v2(
  50,null,null,'00000000-0000-0000-0000-000000000002')),
  2,'member history includes earlier listings for the same address');
select throws_ok($$select * from public.list_membership_audit_events(52)$$,
  '22023',null,'direct reader has bounded page');
select throws_ok($$select * from public.list_membership_audit_events(
  20,'2030-01-01T00:00:00Z',null)$$,'22023',null,
  'partial cursor is rejected');
reset role;
select * from finish();
rollback;
