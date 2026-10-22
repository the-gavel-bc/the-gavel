begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
insert into public.articles(id,owner_profile_id,section_id,title,slug,created_at,updated_at) values
('50000000-0000-0000-0000-000000000071','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000051','Synthetic Draft','synthetic-draft','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z');
create function pg_temp.save_input(p_patch jsonb default '{}',p_request uuid default gen_random_uuid(),p_version integer default 1,p_article uuid default '50000000-0000-0000-0000-000000000071') returns jsonb language sql as $$
select public.save_article_draft(p_article,p_version,p_request,pg_temp.draft_input(p_patch));
$$;
select is(pg_temp.save_input('{}','80000000-0000-0000-0000-000000000081')->>'changed','false','unchanged draft is a no-op');
select is((select updated_at from public.articles),'2026-01-02T00:00:00Z'::timestamptz,'no-op leaves old timestamp untouched by update trigger');
select is((select edit_version from public.articles),1,'no-op preserves version');
select is((select count(*)::integer from public.article_revisions),0,'no-op emits no revision');
select is((select count(*)::integer from public.audit_events),0,'no-op emits no audit');
select is((select changed from private.draft_write_receipts),false,'no-op creates unchanged receipt');
select is((select attempt_count from private.draft_write_limits),1,'new no-op counts as an attempt');
select is(pg_temp.save_input('{}','80000000-0000-0000-0000-000000000081')->>'replayed','true','no-op retry replays');
select is((select attempt_count from private.draft_write_limits),1,'no-op replay costs no attempt');
select is(pg_temp.save_input('{"title":"Changed"}','80000000-0000-0000-0000-000000000081')->>'code','request_conflict','changed payload cannot reuse completed ID');
select is(pg_temp.save_input('{}','80000000-0000-0000-0000-000000000081',2)->>'code','request_conflict','changed expected version cannot reuse completed ID');
select is(pg_temp.save_input('{}','80000000-0000-0000-0000-000000000081',1,'50000000-0000-0000-0000-000000000099')->>'code','request_conflict','changed resource cannot reuse completed ID');
select is(public.create_article_draft('80000000-0000-0000-0000-000000000081',pg_temp.draft_input())->>'code','request_conflict','save receipt cannot be reused as create');
select is(pg_temp.save_input('{"status":"published"}')->>'code','invalid_input','protected status rejected');
select is(pg_temp.save_input('{"ownerProfileId":"10000000-0000-0000-0000-000000000003"}')->>'code','invalid_input','protected owner rejected');
select is(pg_temp.save_input('{"content":{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"image"}]}}}')->>'code','invalid_input','unsafe body rejected directly at RPC');
select is(pg_temp.save_input('{"categoryIds":["30000000-0000-0000-0000-000000000053"]}')->>'code','invalid_input','inactive category rejected');
select is(pg_temp.save_input('{"tagIds":["40000000-0000-0000-0000-000000000099"]}')->>'code','invalid_input','missing tag rejected');
select is(pg_temp.save_input('{"contributors":[{"profileId":"10000000-0000-0000-0000-000000000052","role":"writer","displayOrder":0}]}')->>'code','invalid_input','inactive profile rejected');
update private.draft_write_limits set attempt_count=30;
select is(pg_temp.save_input('{"title":"Rate limited"}')->>'code','rate_limited','exhausted save quota enforced');
select is(pg_temp.save_input('{}','80000000-0000-0000-0000-000000000081')->>'replayed','true','successful save replay remains free at quota limit');
select is((select count(*)::integer from public.article_revisions),0,'all invalid or replayed saves preserve history');
select * from finish();
rollback;
