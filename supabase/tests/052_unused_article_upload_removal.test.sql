begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
-- Publishing and editing published articles are editor/administrator powers; these cases act as an administrator.
update public.memberships set role='administrator' where user_id='00000000-0000-0000-0000-000000000002';
create temp table unused_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000005201',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on unused_target to authenticated,service_role;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at)
select ('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,article_id,
  '00000000-0000-0000-0000-000000000002',('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'unused/'||n||'.webp','finalized',1234,120,90,repeat('a',64),now()
from unused_target cross join (values (5201),(5203),(5204),(5205),(5206),(5208)) rows(n);
update public.media_assets set status='uploading',byte_size=null,width=null,height=null,sha256=null,finalized_at=null
where id='60000000-0000-0000-0000-000000005206';
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000005203','Alt','Credit' from unused_target;
insert into public.article_body_images(article_id,asset_id)
select article_id,'60000000-0000-0000-0000-000000005204' from unused_target;
insert into public.article_revisions(article_id,actor_user_id,snapshot)
select article_id,'00000000-0000-0000-0000-000000000002',
  jsonb_set(private.capture_draft_snapshot(article_id),'{mainImage}',
    '{"assetId":"60000000-0000-0000-0000-000000005205","altText":"Alt","credit":"Credit"}'::jsonb)
from unused_target;
create temp table unused_results(label text primary key,result jsonb);
grant select,insert on unused_results to authenticated,service_role;
set local role authenticated;
insert into unused_results values ('uploading',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005206'));
insert into unused_results values ('uploading_retry',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005206'));
reset role;
select is((select result->>'ok' from unused_results where label='uploading'),'true','owner can explicitly cancel an unreferenced in-flight upload');
select is((select status from public.media_assets where id='60000000-0000-0000-0000-000000005206'),
  'deleting','explicit cancellation fences the in-flight upload');
select is((select result->>'replayed' from unused_results where label='uploading_retry'),'true',
  'explicit cancellation retains exact retry behavior');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select is(public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201')->>'code','not_found','cross-owner cleanup denied');
reset role;
insert into public.article_contributors(article_id,profile_id,contribution_role)
select article_id,'10000000-0000-0000-0000-000000000003','writer' from unused_target;
set local role authenticated;
insert into unused_results values ('credited_remove',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201'));
reset role;
select is((select result->>'code' from unused_results where label='credited_remove'),'not_found','credit grants no cleanup authority');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select is(public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201')->>'code','forbidden','inactive actor cannot mark an upload');
reset role;
select set_config('request.jwt.claim.sub','',true);
select is(public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201')->>'code','forbidden','missing actor cannot mark an upload');
update public.articles set status='published',published_at=now() where id=(select article_id from unused_target);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
insert into unused_results values ('published_remove',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201'));
insert into unused_results values ('published_retry',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201'));
insert into unused_results values ('main',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005203'));
insert into unused_results values ('body',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005204'));
insert into unused_results values ('history',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005205'));
reset role;
select is((select result->>'ok' from unused_results where label='published_remove'),'true','explicit cleanup works after publication');
select is((select result->>'replayed' from unused_results where label='published_retry'),'true','uncertain published cleanup retries safely');
select is((select result->>'code' from unused_results where label='main'),'conflict','current main reference blocks published cleanup');
select is((select result->>'code' from unused_results where label='body'),'conflict','current body reference blocks published cleanup');
select is((select result->>'code' from unused_results where label='history'),'conflict','retained revision reference blocks published cleanup');
set local role service_role;
insert into unused_results values ('complete',public.complete_article_image_removal('00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000005201'));
reset role;
select is((select result->>'ok' from unused_results where label='complete'),'true','trusted completion permits absent published object');
update public.articles set status='archived',archived_at=now() where id=(select article_id from unused_target);
set local role authenticated;
insert into unused_results values ('archived_remove',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005208'));
reset role;
select is((select result->>'code' from unused_results where label='archived_remove'),'conflict','archived cleanup mark denied');
select * from finish();
rollback;
