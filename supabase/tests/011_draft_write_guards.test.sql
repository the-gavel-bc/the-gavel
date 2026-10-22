begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
select is(private.lock_draft_actor(),'10000000-0000-0000-0000-000000000002'::uuid,'actor profile derives from current caller');
select ok(private.check_draft_references(pg_temp.draft_input()),'active section and empty selections accepted');
select ok(private.check_draft_references(pg_temp.draft_input('{"categoryIds":["30000000-0000-0000-0000-000000000051"],"tagIds":["40000000-0000-0000-0000-000000000051"],"contributors":[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":0}]}')),'active category/tag and guest accepted');
select ok(not private.check_draft_references(pg_temp.draft_input(patch)),label) from (values
('{"sectionId":"20000000-0000-0000-0000-000000000052"}'::jsonb,'inactive section rejected'),
('{"categoryIds":["30000000-0000-0000-0000-000000000052"]}'::jsonb,'mismatched category rejected'),
('{"categoryIds":["30000000-0000-0000-0000-000000000053"]}'::jsonb,'inactive category rejected'),
('{"tagIds":["40000000-0000-0000-0000-000000000099"]}'::jsonb,'missing tag rejected'),
('{"contributors":[{"profileId":"10000000-0000-0000-0000-000000000052","role":"writer","displayOrder":0}]}'::jsonb,'inactive guest rejected')) bad(patch,label);
select ok(private.consume_draft_attempt(auth.uid()),'first thirty attempts accepted') from generate_series(1,30);
select ok(not private.consume_draft_attempt(auth.uid()),'thirty-first attempt rejected');
update private.draft_write_limits set window_start=clock_timestamp()-interval '60 seconds';
select ok(private.consume_draft_attempt(auth.uid()),'fixed window resets at sixty seconds');
select is((select attempt_count from private.draft_write_limits),1,'new window begins at one');
select is(octet_length(private.draft_request_hash('create',null,null,pg_temp.draft_input())),32,'fingerprint is SHA256 sized');
select is(private.draft_request_hash('create',null,null,pg_temp.draft_input()),private.draft_request_hash('create',null,null,pg_temp.draft_input('{"schemaVersion":1.0}')),'numeric scale does not change semantic request hash');
select isnt(private.draft_request_hash('create',null,null,pg_temp.draft_input()),private.draft_request_hash('save',null,1,pg_temp.draft_input()),'operation and expected version enter fingerprint');
update public.profiles set active=false where auth_user_id=auth.uid();
select is(private.lock_draft_actor(),null::uuid,'inactive caller profile denied');
update public.profiles set active=true where auth_user_id=auth.uid();
update public.memberships set active=false where user_id=auth.uid();
select is(private.lock_draft_actor(),null::uuid,'inactive membership denied');
update public.memberships set active=true where user_id=auth.uid();
update auth.users set raw_app_meta_data='{"provider":"email","providers":["email"]}' where id=auth.uid();
select is(private.lock_draft_actor(),null::uuid,'untrusted identity denied');
select * from finish();
rollback;
