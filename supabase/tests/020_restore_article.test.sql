begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc

create temp table restore_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000931',
    pg_temp.draft_input(jsonb_build_object('content',
      '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Restore story"}]}]}}'::jsonb)))->>'articleId')::uuid article_id;
grant select on restore_target to authenticated;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at)
select '60000000-0000-0000-0000-000000000931',article_id,
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000932',
  'restore/931.webp','finalized',1234,120,90,repeat('c',64),now() from restore_target;
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000000931','Newsroom','The Gavel' from restore_target;
create function pg_temp.restore(v integer,r uuid) returns jsonb language sql as $$
  select public.restore_article((select article_id from restore_target),v,r);
$$;
grant execute on function pg_temp.restore(integer, uuid) to authenticated;
create temp table restore_results(label text primary key,result jsonb);
grant select,insert on restore_results to authenticated;

select has_function('public','restore_article',array['uuid','integer','uuid'],'restore boundary exists');
select ok(not has_function_privilege('anon','public.restore_article(uuid,integer,uuid)','EXECUTE'),
  'anonymous cannot restore');
select ok(not has_table_privilege('authenticated','public.articles','UPDATE'),
  'application roles cannot set status directly');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
insert into restore_results values('draft_restore',pg_temp.restore(1,gen_random_uuid()));
insert into restore_results select 'published',public.publish_article(article_id,1,gen_random_uuid()) from restore_target;
insert into restore_results select 'archived',public.archive_article(article_id,2,gen_random_uuid()) from restore_target;
reset role;
select is((select result->>'code' from restore_results where label='draft_restore'),'conflict',
  'draft cannot restore');
select is((select status::text from public.articles),'archived','setup is archived');
create temp table original_identity as select published_at,slug,owner_profile_id from public.articles;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
insert into restore_results values('owner_restore',pg_temp.restore(3,gen_random_uuid()));
reset role;
select is((select result->>'code' from restore_results where label='owner_restore'),'not_found',
  'owner cannot restore');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into restore_results values('other_restore',pg_temp.restore(3,gen_random_uuid()));
reset role;
select is((select result->>'code' from restore_results where label='other_restore'),'not_found',
  'another author cannot restore');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
insert into restore_results values('inactive_restore',pg_temp.restore(3,gen_random_uuid()));
reset role;
select is((select result->>'code' from restore_results where label='inactive_restore'),'forbidden',
  'inactive administrator cannot restore');
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000004';

delete from public.article_main_images where article_id=(select article_id from restore_target);
set local role authenticated;
insert into restore_results values('unready_restore',pg_temp.restore(3,gen_random_uuid()));
reset role;
select is((select result->>'code' from restore_results where label='unready_restore'),'invalid_input',
  'missing main image blocks restore');
select is((select count(*)::integer from public.article_revisions),3,
  'failed restore adds no revision');
create temp table original_body as select content from public.articles;
update public.articles set content='{"legacy":true}'::jsonb;
set local role authenticated;
insert into restore_results values('unsupported_restore',pg_temp.restore(3,gen_random_uuid()));
reset role;
select is((select result->>'code' from restore_results where label='unsupported_restore'),'unsupported_content',
  'unsupported archived body cannot restore');
update public.articles set content=(select content from original_body);
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000000931','Newsroom','The Gavel' from restore_target;
update public.sections set active=false where id='20000000-0000-0000-0000-000000000051';
set local role authenticated;
insert into restore_results values('inactive_section',pg_temp.restore(3,gen_random_uuid()));
reset role;
select is((select result->>'code' from restore_results where label='inactive_section'),'invalid_input',
  'inactive referenced section blocks restore');
update public.sections set active=true where id='20000000-0000-0000-0000-000000000051';
set local role authenticated;
insert into restore_results values('stale_restore',pg_temp.restore(2,gen_random_uuid()));
insert into restore_results values('restored',pg_temp.restore(3,'80000000-0000-0000-0000-000000000933'));
insert into restore_results values('restore_retry',pg_temp.restore(3,'80000000-0000-0000-0000-000000000933'));
insert into restore_results values('wrong_status',pg_temp.restore(4,gen_random_uuid()));
insert into restore_results values('reuse',pg_temp.restore(2,'80000000-0000-0000-0000-000000000933'));
reset role;
select is((select result->>'code' from restore_results where label='stale_restore'),'conflict',
  'stale version rejected');
select is((select result->>'status' from restore_results where label='restored'),'published',
  'admin restores archived article');
select is((select result->>'version' from restore_results where label='restored'),'4',
  'restore increments version once');
select is((select result->>'replayed' from restore_results where label='restore_retry'),'true',
  'exact retry replays');
select is((select result->>'code' from restore_results where label='wrong_status'),'conflict',
  'published row cannot restore');
select is((select result->>'code' from restore_results where label='reuse'),'request_conflict',
  'changed request cannot reuse ID');
select is((select archived_at from public.articles),null::timestamptz,
  'restore clears archived timestamp');
select is((select published_at from public.articles),(select published_at from original_identity),
  'restore preserves first publication timestamp');
select is((select slug from public.articles),(select slug from original_identity),
  'restore preserves slug');
select is((select owner_profile_id from public.articles),(select owner_profile_id from original_identity),
  'restore preserves owner');
select is((select count(*)::integer from public.article_revisions),4,
  'restore writes one revision');
select is((select count(*)::integer from public.audit_events where action='article.restored'),1,
  'restore writes one trusted audit');
select is((select count(*)::integer from private.draft_write_receipts where operation='restore'),1,
  'restore writes one receipt');
set local role authenticated;
insert into restore_results select 'rearchived',public.archive_article(article_id,4,gen_random_uuid()) from restore_target;
reset role;
select is(pg_temp.restore(3,'80000000-0000-0000-0000-000000000933')->>'version','4',
  'old retry preserves original version after rearchive');
select is((select status::text from public.articles),'archived',
  'old retry does not reopen later archive');

create function pg_temp.fail_restore_audit() returns trigger language plpgsql as $$
begin
  if new.action='article.restored' then raise exception 'synthetic restore audit failure'; end if;
  return new;
end;
$$;
create trigger synthetic_restore_audit_failure before insert on public.audit_events
for each row execute function pg_temp.fail_restore_audit();
set local role authenticated;
insert into restore_results values('rolled_back',pg_temp.restore(5,
  '80000000-0000-0000-0000-000000000934'));
reset role;
select is((select result->>'code' from restore_results where label='rolled_back'),'unavailable',
  'audit failure returns safe unavailable');
select is((select status::text from public.articles),'archived',
  'failed audit rolls back restored status');
select is((select count(*)::integer from public.article_revisions),5,
  'failed audit rolls back revision');
select is((select count(*)::integer from private.draft_write_receipts where operation='restore'),1,
  'failed audit rolls back receipt');
drop trigger synthetic_restore_audit_failure on public.audit_events;
set local role authenticated;
insert into restore_results values('after_rollback',pg_temp.restore(5,
  '80000000-0000-0000-0000-000000000934'));
reset role;
select is((select result->>'version' from restore_results where label='after_rollback'),'6',
  'same request ID can succeed after rollback');

select * from finish();
rollback;
