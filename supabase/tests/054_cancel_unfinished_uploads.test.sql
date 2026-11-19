begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
-- Publishing and editing published articles are editor/administrator powers; these cases act as an administrator.
update public.memberships set role='administrator' where user_id='00000000-0000-0000-0000-000000000002';
create temp table cancel_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000951',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on cancel_target to authenticated,service_role;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
select '60000000-0000-0000-0000-000000000951',article_id,
 '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000952',
 article_id::text||'/60000000-0000-0000-0000-000000000951.webp','uploading' from cancel_target;
create temp table cancel_results(label text,result jsonb);
grant insert,select on cancel_results to authenticated,service_role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into cancel_results values('foreign',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000951'));
reset role;
select is((select result->>'code' from cancel_results where label='foreign'),'not_found','other author cannot cancel upload');
update public.articles set status='published',published_at=now() where id=(select article_id from cancel_target);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
insert into cancel_results values('cancel',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000951'));
insert into cancel_results values('retry',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000951'));
reset role;
select is((select result->>'ok' from cancel_results where label='cancel'),'true','owner can cancel upload interrupted by publication');
select is((select result->>'replayed' from cancel_results where label='retry'),'true','cancellation is retryable');
set local role service_role;
insert into cancel_results values('finalize',public.finalize_article_image_upload('00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000951',repeat('a',64),12,2,2));
insert into cancel_results values('complete',public.complete_article_image_removal('00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000951'));
reset role;
select is((select result->>'code' from cancel_results where label='finalize'),'conflict','cancellation fences late finalization');
select is((select result->>'ok' from cancel_results where label='complete'),'true','trusted completion retires cancelled row');
select ok(exists(select 1 from private.media_key_registry where asset_id='60000000-0000-0000-0000-000000000951' and retired),'retired registry catches late writes');
select ok(exists(select 1 from private.media_cleanup_ledger where asset_id='60000000-0000-0000-0000-000000000951'),'permanent cleanup ledger retained');
select * from finish();
rollback;
