begin;
select no_plan();
\ir support/review-fixtures/review-fixtures.inc
select has_function('public','ensure_tag',array['text'],'tag creation RPC exists');
select ok(not has_function_privilege('anon','public.ensure_tag(text)','EXECUTE'),'anonymous execution denied');
select ok(has_function_privilege('authenticated','public.ensure_tag(text)','EXECUTE'),'authenticated execution granted');
select ok(not has_table_privilege('authenticated','public.tags','INSERT'),'direct tag insertion stays closed');
select ok(not has_table_privilege('authenticated','public.tags','UPDATE'),'direct tag updates stay closed');
create temp table before_tag_creation as select
  (select count(*) from public.articles) articles,
  (select count(*) from public.profiles) profiles,
  (select count(*) from public.memberships) memberships,
  (select count(*) from public.audit_events) audits,
  (select count(*) from public.tags where name in ('Denied '||pg_temp.review_fixture_token(),'Rate denied '||pg_temp.review_fixture_token())) denied_tags;
select set_config('request.jwt.claim.sub','',true);
select is(public.ensure_tag('Denied '||pg_temp.review_fixture_token())->>'code','forbidden','missing identity denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is(public.ensure_tag('Denied '||pg_temp.review_fixture_token())->>'code','forbidden','inactive member denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update auth.users set raw_app_meta_data='{"provider":"email"}' where id=auth.uid();
select is(public.ensure_tag('Denied '||pg_temp.review_fixture_token())->>'code','forbidden','ineligible identity denied');
update auth.users set email='typed-tags@bc.edu',email_confirmed_at=now(),raw_app_meta_data='{"provider":"google"}' where id=auth.uid();
update public.profiles set active=false where auth_user_id=auth.uid();
select is(public.ensure_tag('Denied '||pg_temp.review_fixture_token())->>'code','forbidden','inactive profile denied');
update public.profiles set active=true where auth_user_id=auth.uid();
insert into private.draft_write_limits(actor_user_id,window_start,attempt_count)
values(auth.uid(),clock_timestamp(),0)
on conflict(actor_user_id) do update set window_start=excluded.window_start,attempt_count=0;
set local role authenticated;
select is(public.ensure_tag(null)->>'code','invalid_input','null input rejected');
select is(public.ensure_tag(U&'campus\001Bnews')->>'code','invalid_input','escape in a name is refused');
select is(public.ensure_tag(U&'campus\0085news')->>'code','invalid_input','C1 control in a name is refused');

select is(public.ensure_tag(E' \n\t ')->>'code','invalid_input','empty normalized name rejected');
select is(public.ensure_tag(repeat('x',121))->>'code','invalid_input','overlong name rejected');
select is(public.ensure_tag(E'  Typed\t tag\n name  '||pg_temp.review_fixture_token()||'  ')->>'name','Typed tag name '||pg_temp.review_fixture_token(),'name whitespace normalized');
select is(public.ensure_tag('typed TAG name '||pg_temp.review_fixture_token())->>'created','false','case insensitive name reused');
select is(public.ensure_tag('Typed tag name '||pg_temp.review_fixture_token())->>'id',public.ensure_tag('typed tag NAME '||pg_temp.review_fixture_token())->>'id','retries reuse same ID');
select is(public.ensure_tag('A typed collision '||pg_temp.review_fixture_token())->>'slug','a-typed-collision-'||pg_temp.review_fixture_token(),'first slug uses base');
select is(public.ensure_tag('A typed collision '||pg_temp.review_fixture_token()||'!')->>'slug','a-typed-collision-'||pg_temp.review_fixture_token()||'-2','slug collision suffixed');
select is(public.ensure_tag('A typed collision '||pg_temp.review_fixture_token()||' 2')->>'slug','a-typed-collision-'||pg_temp.review_fixture_token()||'-2-2','overlapping bases remain unique');
select is(public.ensure_tag(repeat('z',108)||pg_temp.review_fixture_token())->>'name',repeat('z',108)||pg_temp.review_fixture_token(),'120 characters allowed');
reset role;
select is((select count(*)::integer from public.tags where lower(name)='typed tag name '||pg_temp.review_fixture_token()),1,'one normalized tag exists');
select results_eq($$select (select count(*) from public.articles),(select count(*) from public.profiles),
  (select count(*) from public.memberships),(select count(*) from public.audit_events)$$,
  $$select articles,profiles,memberships,audits from before_tag_creation$$,'no unrelated table changes');
update private.draft_write_limits set attempt_count=30,window_start=clock_timestamp() where actor_user_id=auth.uid();
set local role authenticated;
select is(public.ensure_tag('Rate denied '||pg_temp.review_fixture_token())->>'code','rate_limited','rate limit enforced');
reset role;
select is((select count(*) from public.tags where name in ('Denied '||pg_temp.review_fixture_token(),'Rate denied '||pg_temp.review_fixture_token())),
  (select denied_tags from before_tag_creation),'denials create no tags');
select * from finish();
rollback;
