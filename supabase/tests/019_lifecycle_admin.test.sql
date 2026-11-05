begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create temp table admin_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000911',
    pg_temp.draft_input(jsonb_build_object('content',
      '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Admin story"}]}]}}'::jsonb)))->>'articleId')::uuid article_id;
grant select on admin_target to authenticated;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at)
select '60000000-0000-0000-0000-000000000911',article_id,
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000912',
  'lifecycle/911.webp','finalized',1234,120,90,repeat('b',64),now() from admin_target;
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000000911','Newsroom','The Gavel' from admin_target;
create function pg_temp.fail_lifecycle_audit() returns trigger language plpgsql as $$
begin
  if new.action='article.published' then raise exception 'synthetic audit failure'; end if;
  return new;
end;
$$;
create trigger synthetic_lifecycle_audit_failure before insert on public.audit_events
for each row execute function pg_temp.fail_lifecycle_audit();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
create temp table admin_results(label text primary key,result jsonb);
grant select,insert on admin_results to authenticated;
set local role authenticated;
insert into admin_results select 'rolled_back',public.publish_article(article_id,1,
  '80000000-0000-0000-0000-000000000913') from admin_target;
reset role;
select is((select result->>'code' from admin_results where label='rolled_back'),'unavailable',
  'audit failure returns safe unavailable');
select is((select status::text from public.articles),'draft','failed audit rolls back transition');
select is((select count(*)::integer from public.article_revisions),1,'failed audit rolls back revision');
select is((select count(*)::integer from private.draft_write_receipts where operation='publish'),0,
  'failed audit rolls back receipt');
drop trigger synthetic_lifecycle_audit_failure on public.audit_events;
set local role authenticated;
insert into admin_results select 'admin_publish',public.publish_article(article_id,1,
  '80000000-0000-0000-0000-000000000913') from admin_target;
reset role;
select is((select result->>'status' from admin_results where label='admin_publish'),'published',
  'administrator publishes another owner article');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into admin_results select 'other_archive',public.archive_article(article_id,2,gen_random_uuid())
  from admin_target;
reset role;
select is((select result->>'code' from admin_results where label='other_archive'),'not_found',
  'other author cannot archive');
delete from public.article_main_images where article_id=(select article_id from admin_target);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
insert into admin_results select 'admin_archive',public.archive_article(article_id,2,gen_random_uuid())
  from admin_target;
reset role;
select is((select result->>'status' from admin_results where label='admin_archive'),'archived',
  'administrator can archive a published row with missing current media');
select * from finish();
rollback;
