begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
insert into private.draft_write_limits(actor_user_id,window_start,attempt_count)
  values(auth.uid(),clock_timestamp(),30)
  on conflict(actor_user_id) do update set window_start=excluded.window_start,attempt_count=30;
set local role authenticated;
select is(public.create_guest_contributor(gen_random_uuid(),U&'News\3164Desk')->>'code',
  'invalid_input','a new guest name rejects Hangul filler');
select is(public.create_guest_contributor(gen_random_uuid(),U&'\FEFFDesk')->>'code',
  'invalid_input','a leading BOM is invalid even at quota');
reset role;
select is((select count(*) from pg_catalog.pg_locks
  where pid=pg_catalog.pg_backend_pid() and locktype='advisory'),0::bigint,
  'invalid guest edits take no shared advisory locks');
update private.draft_write_limits set attempt_count=0 where actor_user_id=auth.uid();
set local role authenticated;

select is(public.save_own_public_profile(1,gen_random_uuid(),U&'News\202EDesk',null)->>'code',
  'invalid_input','a new profile name rejects a bidi override');
select is(public.save_own_public_profile(1,gen_random_uuid(),'Reporter',U&'News\2800Desk')->>'code',
  'invalid_input','a new biography rejects invisible braille blank');

reset role;
create temp table guest_receipt as
  select public.create_guest_contributor('77000000-0000-0000-0000-000000000001',
    'Synthetic guest prior receipt') as result;
grant select on guest_receipt to authenticated;
select is((select result->>'created' from guest_receipt),'true','create a guest receipt fixture');
update private.profile_write_receipts set payload_hash=private.membership_payload_hash(
  jsonb_build_object('operation','create_guest_author','displayName',U&'Synthetic\202Eguest'))
where request_id='77000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.create_guest_contributor('77000000-0000-0000-0000-000000000001',
  U&'Synthetic\202Eguest'), (select result||'{"replayed":true}'::jsonb from guest_receipt),
  'exact guest receipt from before the new rule still replays');
select is(public.create_guest_contributor('77000000-0000-0000-0000-000000000001',
  U&'Different\202Eguest')->>'code','request_conflict','a changed legacy retry remains a conflict');
reset role;
create temp table own_receipt as
  select public.save_own_public_profile(1,'77000000-0000-0000-0000-000000000002',
    'Synthetic profile for receipt','Biography') as result;
grant select on own_receipt to authenticated;
select is((select result->>'ok' from own_receipt),'true','create a profile receipt fixture');
update private.profile_write_receipts set payload_hash=private.membership_payload_hash(
  jsonb_build_object('operation','save_own','profileId',profile_id,'expectedVersion',1,
    'displayName','Synthetic profile for receipt','biography',U&'Old\2800biography'))
where request_id='77000000-0000-0000-0000-000000000002';
set local role authenticated;
select is(public.save_own_public_profile(1,'77000000-0000-0000-0000-000000000002',
  'Synthetic profile for receipt',U&'Old\2800biography'),
  (select result||'{"replayed":true}'::jsonb from own_receipt),'exact legacy profile receipt replays');
select is(public.save_own_public_profile(1,'77000000-0000-0000-0000-000000000002',
  'Synthetic profile for receipt',U&'Changed\2800biography')->>'code',
  'request_conflict','a changed legacy profile request conflicts');



select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.save_site_information(1,gen_random_uuid(),U&'News\200Ddesk',null,null,null,null,null,null)->>'code',
  'invalid_input','new mission text rejects a Unicode format character');
select is(public.save_site_information(1,gen_random_uuid(),null,null,null,U&'News\2800desk',null,null,null)->>'code',
  'invalid_input','new submission instructions reject invisible filler');
reset role;
create temp table site_receipt as
  select public.save_site_information(1,'77000000-0000-0000-0000-000000000003',
    'Synthetic mission',null,null,null,null,null,null) as result;
grant select on site_receipt to authenticated;
select is((select result->>'ok' from site_receipt),'true','create a site receipt fixture');
update private.site_information_receipts set payload_hash=private.membership_payload_hash(
  jsonb_build_object('operation','site_information.save','version',1,'mission',U&'Old\200Dmission',
    'email',null,'instagram',null,'instructions',null,'spotify',null,'linkedin',null,'facebook',null))
where request_id='77000000-0000-0000-0000-000000000003';
set local role authenticated;
select is(public.save_site_information(1,'77000000-0000-0000-0000-000000000003',
  U&'Old\200Dmission',null,null,null,null,null,null),
  (select result||'{"replayed":true}'::jsonb from site_receipt),'exact legacy site receipt replays');
select is(public.save_site_information(1,'77000000-0000-0000-0000-000000000003',
  U&'Changed\200Dmission',null,null,null,null,null,null)->>'code',
  'request_conflict','a changed legacy site request conflicts');
reset role;
select * from finish();
rollback;
