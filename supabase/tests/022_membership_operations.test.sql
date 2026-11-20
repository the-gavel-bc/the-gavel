begin;
select no_plan();

update auth.users set email='membership-' || right(id::text,1) || '@bc.edu',
  email_confirmed_at=now(),raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004');
update public.memberships set role='editor'
where user_id='00000000-0000-0000-0000-000000000003';
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
  ('90000000-0000-0000-0000-000000000005','new5@bc.edu',now(),
    '{"provider":"google","providers":["google"]}'::jsonb,'{}'),
  ('90000000-0000-0000-0000-000000000006','new6@bc.edu',now(),
    '{"provider":"google","providers":["google"]}'::jsonb,'{}');
insert into public.profiles(display_name,slug) values('Guest contributor','new-member');

select has_function('public','approve_membership',
  array['uuid','uuid','app_role','text','integer'],'approval RPC exists');
select ok(not has_function_privilege('anon',
  'public.approve_membership(uuid,uuid,public.app_role,text,integer)','EXECUTE'),
  'anonymous cannot call approval');
select ok(not has_table_privilege('authenticated','public.memberships','INSERT'),
  'direct membership insert revoked');
select ok(not has_table_privilege('authenticated','public.memberships','UPDATE'),
  'direct membership update revoked');
select ok(not has_table_privilege('authenticated','public.memberships','DELETE'),
  'direct membership delete revoked');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000901','author','New Member')->>'code'),
  'forbidden','author cannot approve');
reset role;
select is((select count(*)::integer from public.memberships where user_id=
  '90000000-0000-0000-0000-000000000005'),0,'denied approval creates no membership');

-- Editors may review articles but have no staff administration authority.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000924','author','Editor Target')->>'code'),
  'forbidden','editor cannot approve a membership');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000925','author')->>'code'),
  'forbidden','editor cannot change an administrator role');
select is((public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000926')->>'code'),
  'forbidden','editor cannot deactivate an administrator');
reset role;

update auth.users set raw_app_meta_data='{"provider":"email"}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000920','author','New Member')->>'code'),
  'forbidden','ineligible administrator cannot approve');
reset role;
update auth.users set raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000004';
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000921','author','New Member')->>'code'),
  'forbidden','inactive administrator cannot approve');
reset role;
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000004';
update auth.users set email_confirmed_at=null where id='90000000-0000-0000-0000-000000000006';
set local role authenticated;
select is((public.approve_membership('90000000-0000-0000-0000-000000000006',
  '80000000-0000-0000-0000-000000000923','author','Second Admin')->>'code'),
  'invalid_input','unconfirmed target cannot be approved');
reset role;
update auth.users set email_confirmed_at=now() where id='90000000-0000-0000-0000-000000000006';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is((public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000902')->>'code'),
  'conflict','sole eligible administrator cannot deactivate self');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000903','author')->>'code'),
  'conflict','sole eligible administrator cannot demote self');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000904','author','New Member')->>'ok'),
  'true','administrator approves signed-in eligible person');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000904','author','New Member')->>'replayed'),
  'true','exact request replays original result');
select is((public.approve_membership('90000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000904','administrator','New Member')->>'code'),
  'request_conflict','changed request cannot reuse receipt');
reset role;
select is((select role::text from public.memberships where user_id=
  '90000000-0000-0000-0000-000000000005'),'author','approval stores requested role');
select is((select slug from public.profiles where auth_user_id=
  '90000000-0000-0000-0000-000000000005'),'new-member-2',
  'profile slug handles an existing guest collision');
select is((select count(*)::integer from public.audit_events where
  resource_type='membership' and resource_id='90000000-0000-0000-0000-000000000005'),
  1,'approval emits exactly one membership audit');
select ok((select active and approved_at is not null and approved_by=
  '00000000-0000-0000-0000-000000000004' and revoked_at is null
  from public.memberships where user_id='90000000-0000-0000-0000-000000000005'),
  'approval records trusted approver and timestamps');

set local role authenticated;
select is((public.change_membership_role('90000000-0000-0000-0000-000000000005',1,
  '80000000-0000-0000-0000-000000000905','administrator')->>'version'),
  '2','role change increments version');
select is((public.change_membership_role('90000000-0000-0000-0000-000000000005',1,
  '80000000-0000-0000-0000-000000000906','author')->>'code'),
  'conflict','stale role change cannot overwrite');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000907','author')->>'ok'),
  'true','self-demotion succeeds after another eligible administrator exists');
select is((public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '80000000-0000-0000-0000-000000000907','author')->>'replayed'),
  'true','self-demoted actor can replay only own exact receipt');
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',2,
  '80000000-0000-0000-0000-000000000908')->>'code'),
  'forbidden','former administrator cannot issue a new mutation');
reset role;

select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000005',true);
set local role authenticated;
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',2,
  '80000000-0000-0000-0000-000000000909')->>'code'),
  'conflict','new sole administrator cannot deactivate self');
select is((public.approve_membership('90000000-0000-0000-0000-000000000006',
  '80000000-0000-0000-0000-000000000910','administrator','Second Admin')->>'ok'),
  'true','new administrator can approve another');
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',2,
  '80000000-0000-0000-0000-000000000911')->>'ok'),
  'true','self-deactivation succeeds when another remains');
select is((public.deactivate_membership('90000000-0000-0000-0000-000000000005',2,
  '80000000-0000-0000-0000-000000000911')->>'replayed'),
  'true','self-deactivated actor can replay exact receipt');
reset role;
select ok((select not active and revoked_at is not null and approved_at is not null
  from public.memberships where user_id='90000000-0000-0000-0000-000000000005'),
  'deactivation preserves approval and records revocation');
select is((select count(*)::integer from public.audit_events where
  resource_type='membership' and action='membership.deactivated' and
  resource_id='90000000-0000-0000-0000-000000000005'),1,
  'deactivation emits one audit event');

select * from finish();
rollback;
