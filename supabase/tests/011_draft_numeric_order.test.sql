begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
select lives_ok($$select private.check_draft_input(pg_temp.draft_input('{"contributors":[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":1.0}]}'))$$,'integer-valued decimal order is valid JSON input');
select is(private.check_draft_input(pg_temp.draft_input('{"contributors":[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":1.0}]}')) #>> '{value,contributors,0,displayOrder}','1','integer-valued decimal canonicalizes to integer');
select * from finish();
rollback;
