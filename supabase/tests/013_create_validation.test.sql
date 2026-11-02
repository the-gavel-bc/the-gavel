begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
select is(public.create_article_draft(gen_random_uuid(),pg_temp.draft_input(patch))->>'code',expected,label) from (values
('{"ownerProfileId":"10000000-0000-0000-0000-000000000003"}'::jsonb,'invalid_input','forged owner rejected'),
('{"actorUserId":"00000000-0000-0000-0000-000000000003"}'::jsonb,'invalid_input','forged actor rejected'),
('{"status":"published"}'::jsonb,'invalid_input','forged lifecycle rejected'),
('{"createdAt":"2026-01-01"}'::jsonb,'invalid_input','forged timestamp rejected'),
('{"title":""}'::jsonb,'invalid_input','invalid title rejected'),
('{"content":{"format":"other","version":1}}'::jsonb,'unsupported_content','unknown body version rejected'),
('{"content":{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"image"}]}}}'::jsonb,'invalid_input','unsupported body nodes rejected'),
('{"categoryIds":["30000000-0000-0000-0000-000000000052"]}'::jsonb,'invalid_input','wrong-section category rejected'),
('{"categoryIds":["30000000-0000-0000-0000-000000000053"]}'::jsonb,'invalid_input','inactive category rejected'),
('{"sectionId":"20000000-0000-0000-0000-000000000052"}'::jsonb,'invalid_input','inactive section rejected'),
('{"tagIds":["40000000-0000-0000-0000-000000000099"]}'::jsonb,'invalid_input','missing tag rejected'),
('{"contributors":[{"profileId":"10000000-0000-0000-0000-000000000052","role":"writer","displayOrder":0}]}'::jsonb,'invalid_input','inactive credit rejected')) bad(patch,expected,label);
select is(public.create_article_draft(null,pg_temp.draft_input())->>'code','invalid_input','NULL request ID safely rejected');
select is((select count(*)::integer from public.articles),0,'all validation failures preserve empty content');
select is((select count(*)::integer from public.article_revisions),0,'validation failures emit no history');
select is((select attempt_count from private.draft_write_limits),13,'invalid attempts count toward quota');
select is(public.create_article_draft(gen_random_uuid(),'{}')->>'code','invalid_input','remaining invalid attempt counts') from generate_series(14,30);
select is(public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'code','rate_limited','thirty-first attempt cannot create');
update private.draft_write_limits set window_start=clock_timestamp()-interval '60 seconds';
select is(public.create_article_draft('80000000-0000-0000-0000-000000000061',pg_temp.draft_input())->>'ok','true','new window permits create');
update private.draft_write_limits set attempt_count=30;
select is(public.create_article_draft('80000000-0000-0000-0000-000000000061',pg_temp.draft_input())->>'replayed','true','successful replay is free even at exhausted quota');
update private.draft_write_limits set attempt_count=0;
select is(public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'ok','true','duplicate title receives generated suffix');
select is((select count(*)::integer from public.article_revisions),2,'second generated slug creates its own history');
select is(public.create_article_draft('80000000-0000-0000-0000-000000000061','{}')->>'code','request_conflict','malformed completed-ID reuse cannot become a new command');
update private.draft_write_receipts set operation='save',expected_version=1;
select is(public.create_article_draft('80000000-0000-0000-0000-000000000061',pg_temp.draft_input())->>'code','request_conflict','operation mismatch rejected');
select * from finish();
rollback;
