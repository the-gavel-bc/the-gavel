begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create temp table target as select (public.create_article_draft('80000000-0000-0000-0000-000000000091',pg_temp.draft_input('{"categoryIds":["30000000-0000-0000-0000-000000000051"],"tagIds":["40000000-0000-0000-0000-000000000051"],"contributors":[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":0}]}'))->>'articleId')::uuid id;
create function pg_temp.save_payload(p_changed boolean default true) returns jsonb language sql as $$
select pg_temp.draft_input('{"categoryIds":["30000000-0000-0000-0000-000000000051"],"tagIds":["40000000-0000-0000-0000-000000000051"],"contributors":[{"profileId":"10000000-0000-0000-0000-000000000051","role":"writer","displayOrder":0}]}'::jsonb || case when p_changed then '{"title":"Synthetic Updated"}'::jsonb else '{}'::jsonb end);
$$;
create function pg_temp.reject_save_stage() returns trigger language plpgsql as $$begin raise exception 'synthetic save fault'; end;$$;
create function pg_temp.check_save_failure(p_table text,p_event text) returns setof text language plpgsql as $$
declare original jsonb; result jsonb; target_id uuid := (select id from target);
begin
  original := private.capture_draft_snapshot(target_id);
  execute format('create trigger synthetic_save_fault before %s on %s for each row execute function pg_temp.reject_save_stage()',p_event,p_table);
  result := public.save_article_draft(target_id,1,'80000000-0000-0000-0000-000000000092',pg_temp.save_payload());
  return next is(result->>'code','unavailable',p_table||' '||p_event||' returns safe failure');
  return next is(private.capture_draft_snapshot(target_id),original,p_table||' '||p_event||' restores every original field/link/time/version');
  return next is((select count(*)::integer from public.article_revisions),1,p_table||' keeps original revision only');
  return next is((select count(*)::integer from public.audit_events),1,p_table||' keeps original audit only');
  return next is((select count(*)::integer from private.draft_write_receipts),1,p_table||' keeps original receipt only');
  execute format('drop trigger synthetic_save_fault on %s',p_table);
end;
$$;
select pg_temp.check_save_failure(relation,event) from (values
('public.articles','update'),('public.article_categories','delete'),('public.article_tags','delete'),('public.article_contributors','delete'),
('public.article_categories','insert'),('public.article_tags','insert'),('public.article_contributors','insert'),
('public.article_revisions','insert'),('public.audit_events','insert'),('private.draft_write_receipts','insert')) stages(relation,event);
select is((select attempt_count from private.draft_write_limits),11,'ten failed saves retain only quota bookkeeping');
create trigger synthetic_save_fault before insert on private.draft_write_receipts for each row execute function pg_temp.reject_save_stage();
select is(public.save_article_draft((select id from target),1,'80000000-0000-0000-0000-000000000093',pg_temp.save_payload(false))->>'code','unavailable','no-op receipt failure is atomic');
drop trigger synthetic_save_fault on private.draft_write_receipts;
select is(public.save_article_draft((select id from target),1,'80000000-0000-0000-0000-000000000092',pg_temp.save_payload())->>'version','2','failed request succeeds once after fault clears');
select is((select count(*)::integer from public.article_revisions),2,'recovered save emits one revision');
select is((select count(*)::integer from public.audit_events),2,'recovered save emits one audit');
select is((select count(*)::integer from private.draft_write_receipts),2,'only create and recovered save have receipts');
select * from finish();
rollback;
