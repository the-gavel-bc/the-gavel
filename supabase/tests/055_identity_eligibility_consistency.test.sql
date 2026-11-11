begin;
select no_plan();

-- Exactly one eligible administrator; the other has a linked email provider.
update auth.users set email='identity-'||right(id::text,1)||'@bc.edu',
  email_confirmed_at=now(),raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
update public.profiles set active=true where auth_user_id in (
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
update public.memberships set active=false where user_id not in (
  '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
update public.memberships set active=true,revoked_at=null,role='administrator',edit_version=1
where user_id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
update auth.users set raw_app_meta_data='{"provider":"google","providers":["google","email"]}'::jsonb
where id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '95000000-0000-0000-0000-000000000001','author')->>'code','conflict',
  'mixed-provider administrator does not permit the sole eligible admin to demote self');
reset role;
select ok((select active and role='administrator' and edit_version=1 from public.memberships
  where user_id='00000000-0000-0000-0000-000000000004'),'denied demotion preserves membership and version');
-- Restore only synthetic transaction fixtures so each denial tests the same trigger.
update public.memberships set active=true,revoked_at=null,role='administrator',edit_version=1
where user_id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is(public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '95000000-0000-0000-0000-000000000002')->>'code','conflict',
  'mixed-provider administrator does not permit the sole eligible admin to deactivate self');
reset role;
select ok((select active and role='administrator' and edit_version=1 from public.memberships
  where user_id='00000000-0000-0000-0000-000000000004'),'denied deactivation preserves membership and version');
select is((select count(*)::integer from public.audit_events where correlation_id in (
  '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000002')),0,
  'last-admin denials write no success audit');
select is((select count(*)::integer from private.membership_write_receipts where request_id in (
  '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000002')),0,
  'last-admin denials write no success receipts');
update public.memberships set active=true,revoked_at=null,role='administrator',edit_version=1
where user_id='00000000-0000-0000-0000-000000000004';

-- Target checks must use the same rule as actor access and administrator counts.
set local role authenticated;
select is(public.approve_membership('00000000-0000-0000-0000-000000000002',
  '95000000-0000-0000-0000-000000000003','administrator','Mixed admin',1)->>'code',
  'invalid_input','mixed-provider target cannot be approved');
reset role;
update public.memberships set role='author' where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select is(public.change_membership_role('00000000-0000-0000-0000-000000000002',1,
  '95000000-0000-0000-0000-000000000004','administrator')->>'code',
  'invalid_input','mixed-provider author cannot be promoted');
reset role;
select is((select count(*)::integer from public.audit_events where correlation_id in (
  '95000000-0000-0000-0000-000000000003','95000000-0000-0000-0000-000000000004')),0,
  'ineligible target denials write no success audit');

-- Exercise the existing session and trusted-media predicates against the same matrix.
create temp table identity_cases(metadata jsonb,eligible boolean);
insert into identity_cases values
  ('{"provider":"google"}',true),
  ('{"provider":"google","providers":["google"]}',true),
  ('{"provider":"google","providers":[]}',true),
  ('{"provider":"google","providers":["google","email"]}',false),
  ('{"provider":"email","providers":["google"]}',false),
  ('{"provider":"google","providers":"google"}',false),
  ('{"provider":"google","providers":null}',false),
  ('{}',false),('null',false);
create function pg_temp.check_identity_cases() returns setof text language plpgsql as $$ declare c record; begin
  for c in select * from identity_cases loop
    update auth.users set raw_app_meta_data=c.metadata
      where id='00000000-0000-0000-0000-000000000002';
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    return next extensions.is(private.has_eligible_identity(),c.eligible,'session eligibility: '||c.metadata::text);
    return next extensions.is(private.eligible_media_actor('00000000-0000-0000-0000-000000000002'),
      c.eligible,'trusted-media eligibility: '||c.metadata::text);
  end loop;
end $$;
select * from pg_temp.check_identity_cases();

-- Trusted boundaries reject an actor whose provider changed after route access.
update auth.users set raw_app_meta_data='{"provider":"google","providers":["google","email"]}'::jsonb
where id='00000000-0000-0000-0000-000000000002';
set local role service_role;
select is(public.begin_article_image_upload('00000000-0000-0000-0000-000000000002',
  '95000000-0000-0000-0000-000000000099')->>'code','forbidden','mixed-provider trusted upload begin is denied');
select is(public.finalize_article_image_upload('00000000-0000-0000-0000-000000000002',
  '95000000-0000-0000-0000-000000000099',repeat('a',64),12,2,2)->>'code',
  'forbidden','mixed-provider trusted finalization is denied before asset lookup');
select is(public.complete_article_image_removal('00000000-0000-0000-0000-000000000002',
  '95000000-0000-0000-0000-000000000099')->>'code','forbidden','mixed-provider trusted removal completion is denied');
reset role;

-- The shared user-ID helper is internal, never a callable identity lookup.
select has_function('private','has_eligible_identity_for',array['uuid'],'shared identity predicate exists');
select ok(not has_function_privilege('anon','private.has_eligible_identity_for(uuid)','EXECUTE'),
  'anonymous cannot invoke user-ID eligibility lookup');
select ok(not has_function_privilege('authenticated','private.has_eligible_identity_for(uuid)','EXECUTE'),
  'authenticated cannot invoke user-ID eligibility lookup');
select ok(not has_function_privilege('service_role','private.has_eligible_identity_for(uuid)','EXECUTE'),
  'service role cannot invoke user-ID eligibility lookup directly');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is(public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '95000000-0000-0000-0000-000000000008')->>'code','forbidden',
  'mixed-provider actor cannot mutate another membership');
reset role;

-- A second eligible administrator permits the operation, with exact retry semantics.
update auth.users set raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
where id='00000000-0000-0000-0000-000000000002';
update public.memberships set role='administrator',active=true,revoked_at=null,edit_version=1
where user_id='00000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '95000000-0000-0000-0000-000000000005','author')->>'ok','true',
  'two eligible administrators permit self-demotion');
select is(public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '95000000-0000-0000-0000-000000000005','author')->>'replayed','true',
  'self-demoted actor retains exact receipt replay');
select is(public.change_membership_role('00000000-0000-0000-0000-000000000004',1,
  '95000000-0000-0000-0000-000000000005','administrator')->>'code','request_conflict',
  'changed retry cannot reuse the receipt');
select is(public.deactivate_membership('00000000-0000-0000-0000-000000000002',1,
  '95000000-0000-0000-0000-000000000006')->>'code','forbidden','demoted author cannot deactivate another member');
reset role;
update public.memberships set role='administrator',active=true,revoked_at=null,edit_version=1
where user_id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is(public.deactivate_membership('00000000-0000-0000-0000-000000000004',1,
  '95000000-0000-0000-0000-000000000007')->>'ok','true','two eligible administrators permit self-deactivation');
reset role;
select is((select count(*)::integer from public.audit_events where correlation_id=
  '95000000-0000-0000-0000-000000000005'),1,'successful demotion and retry produce one audit');
select * from finish();
rollback;
