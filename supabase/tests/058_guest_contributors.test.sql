begin;
select no_plan();
\ir support/review-fixtures/review-fixtures.inc
select ok(not has_function_privilege('anon','public.search_contributors(text)','execute'),'anonymous search denied');
select ok(not has_function_privilege('anon','public.create_guest_contributor(uuid,text)','execute'),'anonymous guest creation denied');
select ok(not has_table_privilege('authenticated','public.profiles','insert'),'direct guest insert closed');
select set_config('request.jwt.claim.sub','',true);
select is(public.search_contributors('Author')->>'code','forbidden','search missing identity denied');
select is(public.create_guest_contributor(gen_random_uuid(),'Guest')->>'code','forbidden','guest missing identity denied');
select is((select count(*) from pg_catalog.pg_locks
  where pid=pg_catalog.pg_backend_pid() and locktype='advisory'),0::bigint,
  'guest creation denial does not acquire an advisory lock');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is(public.search_contributors('Author')->>'code','forbidden','inactive search denied');
select is(public.create_guest_contributor(gen_random_uuid(),'Guest')->>'code','forbidden','inactive creation denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update auth.users set raw_app_meta_data='{"provider":"email"}' where id=auth.uid();
select is(public.search_contributors('Author')->>'code','forbidden','ineligible search denied');
select is(public.create_guest_contributor(gen_random_uuid(),'Guest')->>'code','forbidden','ineligible creation denied');
update auth.users set email='guest-author@bc.edu',email_confirmed_at=now(),raw_app_meta_data='{"provider":"google"}' where id=auth.uid();
update public.profiles set active=false where auth_user_id=auth.uid();
select is(public.create_guest_contributor(gen_random_uuid(),'Guest')->>'code','forbidden','inactive profile denied');
update public.profiles set active=true where auth_user_id=auth.uid();
insert into private.draft_write_limits(actor_user_id,window_start,attempt_count)
  values(auth.uid(),clock_timestamp(),30)
  on conflict(actor_user_id) do update set window_start=excluded.window_start,attempt_count=30;
set local role authenticated;
select is(public.create_guest_contributor(gen_random_uuid(),'Rate Guest')->>'code',
  'rate_limited','a saturated fresh request is denied before allocating a guest');
reset role;
select is((select count(*) from pg_catalog.pg_locks
  where pid=pg_catalog.pg_backend_pid() and locktype='advisory'),0::bigint,
  'saturated fresh request does not acquire an advisory lock');
update private.draft_write_limits set window_start=clock_timestamp()-interval '61 seconds'
  where actor_user_id=auth.uid();
create temp table guest_before as select (select count(*) from auth.users) users,
  (select count(*) from public.memberships) members,(select count(*) from public.article_contributors) credits;
set local role authenticated;
select is(public.create_guest_contributor(null,'Guest')->>'code','invalid_input','request ID required');
select is(public.create_guest_contributor(gen_random_uuid(),' Guest')->>'code','invalid_input','leading whitespace rejected');
select is(public.create_guest_contributor(gen_random_uuid(),repeat('x',121))->>'code','invalid_input','overlong name rejected');
select is(public.create_guest_contributor(gen_random_uuid(),E'Bad\nName')->>'code','invalid_input','controls rejected');
select is(public.search_contributors('')->>'code','invalid_input','empty search rejected');
select is(public.search_contributors(repeat('x',121))->>'code','invalid_input','long search rejected');
select is(public.create_guest_contributor('d8000000-0000-0000-0000-000000000001','New Guest '||pg_temp.review_fixture_token())->>'created','true','author creates guest after the quota window expires');
select is(public.create_guest_contributor('d8000000-0000-0000-0000-000000000001','New Guest '||pg_temp.review_fixture_token())->>'replayed','true','same request replays');
select is(public.create_guest_contributor('d8000000-0000-0000-0000-000000000001','Changed Guest')->>'code','request_conflict','changed request conflicts');
select is(public.create_guest_contributor('d8000000-0000-0000-0000-000000000002','NEW GUEST '||upper(pg_temp.review_fixture_token()))->>'created','true','a repeated name is a separate one-off credit');
select isnt(public.create_guest_contributor('d8000000-0000-0000-0000-000000000002','NEW GUEST '||upper(pg_temp.review_fixture_token()))->>'id',public.create_guest_contributor('d8000000-0000-0000-0000-000000000001','New Guest '||pg_temp.review_fixture_token())->>'id','one-off credits are never shared by name');
select is(public.create_guest_contributor(gen_random_uuid(),'New Guest '||pg_temp.review_fixture_token()||'!')->>'slug','new-guest-'||pg_temp.review_fixture_token()||'-3','slug collision suffix allocated');
select is(jsonb_array_length(public.search_contributors('guest '||pg_temp.review_fixture_token())->'items'),0,'credit-only names are never suggested');
reset role;
update public.profiles set display_name='Searchable Member '||pg_temp.review_fixture_token() where auth_user_id=auth.uid();
set local role authenticated;
select is(jsonb_array_length(public.search_contributors('searchable member '||upper(pg_temp.review_fixture_token()))->'items'),1,'people with accounts are found case-insensitively');
select is(jsonb_array_length(public.search_contributors('Member%'||pg_temp.review_fixture_token())->'items'),
  0,'a percent inside the unique search phrase is treated literally');
select is((select array_agg(k order by k) from jsonb_object_keys(public.search_contributors('searchable member '||upper(pg_temp.review_fixture_token()))->'items'->0) k),array['displayName','id','slug'],'search exposes only public fields');
reset role;
select is((select count(*)::integer from public.profiles where display_name='New Guest '||pg_temp.review_fixture_token() and auth_user_id is null),1,'guest has no login');
select is((select count(*)::integer from public.audit_events where correlation_id='d8000000-0000-0000-0000-000000000001' and action='profile.created'),1,'retry audited once');
select results_eq($$select (select count(*) from auth.users),(select count(*) from public.memberships),(select count(*) from public.article_contributors)$$,$$select users,members,credits from guest_before$$,'no identities memberships or credits created');
insert into public.profiles(display_name,slug) select 'Bounded Guest '||pg_temp.review_fixture_token()||' '||n,'bounded-guest-'||pg_temp.review_fixture_token()||'-'||n from generate_series(1,12) n;
select is(jsonb_array_length(public.search_contributors('Bounded Guest '||pg_temp.review_fixture_token())->'items'),0,'credit-only rows are not searchable');
update public.profiles set active=true,display_name='Member visibility '||pg_temp.review_fixture_token()
  where auth_user_id='00000000-0000-0000-0000-000000000003';
select is(jsonb_array_length(public.search_contributors('Member visibility '||pg_temp.review_fixture_token())->'items'),
  1,'a linked active profile is searchable');
update public.profiles set active=false
  where auth_user_id='00000000-0000-0000-0000-000000000003';
select is(jsonb_array_length(public.search_contributors('Member visibility '||pg_temp.review_fixture_token())->'items'),
  0,'the linked profile stops appearing when inactive');
update private.draft_write_limits set attempt_count=30,window_start=clock_timestamp() where actor_user_id=auth.uid();
set local role authenticated;
select is(public.create_guest_contributor(gen_random_uuid(),'Rate Guest')->>'code','rate_limited','creation rate limited');
select is(public.create_guest_contributor('d8000000-0000-0000-0000-000000000001','New Guest '||pg_temp.review_fixture_token())->>'replayed','true','receipt replay does not consume quota');
select is(public.create_guest_contributor('d8000000-0000-0000-0000-000000000001','Changed Guest')->>'code',
  'request_conflict','a conflicting retry remains a conflict at quota');
reset role;
select is((select attempt_count from private.draft_write_limits where actor_user_id=auth.uid()),
  30,'limited requests and retries do not debit the full window');
select * from finish();
rollback;
