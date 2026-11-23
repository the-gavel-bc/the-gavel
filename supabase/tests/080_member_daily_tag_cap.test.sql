begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
\ir support/review-fixtures/review-fixtures.inc

select ok(not has_table_privilege('authenticated','private.member_tag_creation_limits','SELECT'),
  'the daily tag ledger stays private');
select is(private.tag_creation_day('2026-01-15 04:59Z'),'2026-01-14'::date,'winter UTC hour before Eastern midnight');
select is(private.tag_creation_day('2026-01-15 05:00Z'),'2026-01-15'::date,'winter Eastern midnight starts the next day');
select is(private.tag_creation_day('2026-07-15 03:59Z'),'2026-07-14'::date,'summer UTC hour before Eastern midnight');
select is(private.tag_creation_day('2026-07-15 04:00Z'),'2026-07-15'::date,'summer Eastern midnight starts the next day');

insert into private.draft_write_limits(actor_user_id,window_start,attempt_count)
select id,clock_timestamp(),0 from auth.users
where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004')
on conflict(actor_user_id) do update set window_start=excluded.window_start,attempt_count=0;
delete from private.member_tag_creation_limits
  where actor_user_id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
insert into private.member_tag_creation_limits(actor_user_id,quota_day,created_count)
values(auth.uid(),private.tag_creation_day(clock_timestamp()),29);
set local role authenticated;
select is(public.ensure_tag('Daily fixture '||pg_temp.review_fixture_token())->>'created','true',
  'the thirtieth daily tag is admitted');
select is(public.ensure_tag('DAILY fixture '||upper(pg_temp.review_fixture_token()))->>'created','false',
  'the capped member can still reuse an existing normalized tag');
select is(public.ensure_tag('Daily over limit '||pg_temp.review_fixture_token())->>'code','conflict',
  'the thirty-first daily creation is refused clearly');
reset role;
select is((select created_count from private.member_tag_creation_limits where actor_user_id=auth.uid()),30,
  'reuse and rejected writes do not advance the daily count');
select is_empty($$select 1 from public.tags where name='Daily over limit '||pg_temp.review_fixture_token()$$,
  'a capped attempt creates no tag');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(public.ensure_tag('Daily over limit '||pg_temp.review_fixture_token())->>'created','true',
  'the next member has an independent daily budget');
reset role;
select is((select created_count from private.member_tag_creation_limits where actor_user_id=auth.uid()),1,
  'the independent member is charged once');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update private.member_tag_creation_limits set quota_day=quota_day-1 where actor_user_id=auth.uid();
set local role authenticated;
select is(public.ensure_tag('Daily new day '||pg_temp.review_fixture_token())->>'created','true',
  'a new Eastern calendar day resets the member quota');
reset role;
select is((select created_count from private.member_tag_creation_limits where actor_user_id=auth.uid()),1,
  'the first creation on the new day starts a fresh count');
select * from finish();
rollback;
