begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create function pg_temp.reject_draft_stage() returns trigger language plpgsql as $$
begin raise exception 'synthetic injected failure'; end;
$$;
create function pg_temp.check_failure(stage text) returns setof text language plpgsql as $$
declare target text; result jsonb;
begin
  target := case when stage='receipt' then 'private.draft_write_receipts' else 'public.'||stage end;
  execute format('create trigger synthetic_failure before insert on %s for each row execute function pg_temp.reject_draft_stage()',target);
  result := public.create_article_draft('80000000-0000-0000-0000-000000000062',pg_temp.draft_input('{"categoryIds":["30000000-0000-0000-0000-000000000051"],"tagIds":["40000000-0000-0000-0000-000000000051"],"contributors":[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":0}]}'));
  return next is(result->>'code','unavailable',stage||' failure returns safe error');
  return next is((select count(*)::integer from public.articles),0,stage||' rolls back article');
  return next is((select count(*)::integer from public.article_categories),0,stage||' rolls back category links');
  return next is((select count(*)::integer from public.article_tags),0,stage||' rolls back tag links');
  return next is((select count(*)::integer from public.article_contributors),0,stage||' rolls back credits');
  return next is((select count(*)::integer from public.article_revisions),0,stage||' rolls back revisions');
  return next is((select count(*)::integer from public.audit_events),0,stage||' rolls back audits');
  return next is((select count(*)::integer from private.draft_write_receipts),0,stage||' rolls back receipt');
  execute format('drop trigger synthetic_failure on %s',target);
end;
$$;
select pg_temp.check_failure(stage) from unnest(array['article_categories','article_tags','article_contributors','article_revisions','audit_events','receipt']) stage;
select is((select attempt_count from private.draft_write_limits),6,'business failures retain only quota bookkeeping');
select is(public.create_article_draft('80000000-0000-0000-0000-000000000062',pg_temp.draft_input())->>'ok','true','failed request can be retried after the fault clears');
select is((select count(*)::integer from public.articles),1,'retry commits exactly one draft');
select * from finish();
rollback;
