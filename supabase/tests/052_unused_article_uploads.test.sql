begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
select ok(not has_function_privilege('anon','public.list_unused_article_uploads(uuid,uuid,integer)','EXECUTE'),
  'anonymous cannot enumerate unused uploads');
select ok(has_function_privilege('authenticated','public.list_unused_article_uploads(uuid,uuid,integer)','EXECUTE'),
  'authenticated listing uses checked RPC');
create temp table unused_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000005201',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on unused_target to authenticated,service_role;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at)
select ('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,article_id,
  '00000000-0000-0000-0000-000000000002',('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'unused/'||n||'.webp','finalized',1234,120,90,repeat('a',64),now()
from unused_target cross join generate_series(5201,5209) n;
update public.media_assets set status=case right(id::text,4) when '5202' then 'deleting' when '5206' then 'uploading' else 'pending' end, byte_size=null,width=null,height=null,sha256=null,finalized_at=null
where id in ('60000000-0000-0000-0000-000000005202','60000000-0000-0000-0000-000000005206','60000000-0000-0000-0000-000000005207');
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
insert into unused_results select 'list',public.list_unused_article_uploads(article_id) from unused_target;
insert into unused_results select 'page1',public.list_unused_article_uploads(article_id,null,1) from unused_target;
insert into unused_results select 'page2',public.list_unused_article_uploads(article_id,'60000000-0000-0000-0000-000000005201',1) from unused_target;
insert into unused_results select 'end',public.list_unused_article_uploads(article_id,'60000000-0000-0000-0000-000000005209',1) from unused_target;
insert into unused_results select 'bounds',public.list_unused_article_uploads(article_id,null,51) from unused_target;
insert into unused_results values ('uploading',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005206'));
insert into unused_results values ('uploading_retry',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005206'));
reset role;
select is(jsonb_array_length((select result->'items' from unused_results where label='list')),4,
  'only finalized unused and deleting rows are discoverable after reload');
select is((select result#>>'{items,0,assetId}' from unused_results where label='page1'),'60000000-0000-0000-0000-000000005201','stable bounded first page');
select is((select result->>'nextCursor' from unused_results where label='page1'),'60000000-0000-0000-0000-000000005201','continuation survives deletion of prior page');
select is((select result#>>'{items,0,status}' from unused_results where label='page2'),'deleting','deleting rows support uncertain cleanup retry');
select is((select result->'items' from unused_results where label='end'),'[]'::jsonb,'last page is empty and bounded');
select is((select result->>'code' from unused_results where label='bounds'),'invalid_input','oversized requests rejected');
select is((select result->>'ok' from unused_results where label='uploading'),'true','owner can explicitly cancel an unreferenced in-flight upload');
select is((select status from public.media_assets where id='60000000-0000-0000-0000-000000005206'),
  'deleting','explicit cancellation fences the in-flight upload');
select is((select result->>'replayed' from unused_results where label='uploading_retry'),'true',
  'explicit cancellation retains exact retry behavior');
select ok(not exists(select 1 from unused_results r cross join lateral jsonb_array_elements(r.result->'items') i
  cross join lateral jsonb_object_keys(i) k where k not in ('assetId','createdAt','status')),
  'listing exposes no object paths or actor identifiers');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into unused_results select 'other',public.list_unused_article_uploads(article_id) from unused_target;
reset role;
insert into public.article_contributors(article_id,profile_id,contribution_role)
select article_id,'10000000-0000-0000-0000-000000000003','writer' from unused_target;
set local role authenticated;
insert into unused_results select 'credited',public.list_unused_article_uploads(article_id) from unused_target;
insert into unused_results values ('credited_remove',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201'));
reset role;
select is((select result->>'code' from unused_results where label='other'),'not_found','cross-owner listing denied');
select is((select result->>'code' from unused_results where label='credited'),'not_found','credit grants no listing authority');
select is((select result->>'code' from unused_results where label='credited_remove'),'not_found','credit grants no cleanup authority');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into unused_results select 'inactive',public.list_unused_article_uploads(article_id) from unused_target;
reset role;
select is((select result->>'code' from unused_results where label='inactive'),'forbidden','inactive actor denied');
select set_config('request.jwt.claim.sub','',true);
select is(public.list_unused_article_uploads((select article_id from unused_target))->>'code','forbidden','missing actor denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
insert into unused_results select 'admin',public.list_unused_article_uploads(article_id) from unused_target;
reset role;
select is((select result->>'ok' from unused_results where label='admin'),'true','active administrator can discover cleanup');
update public.articles set status='published',published_at=now() where id=(select article_id from unused_target);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
insert into unused_results select 'published_list',public.list_unused_article_uploads(article_id) from unused_target;
insert into unused_results values ('published_remove',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201'));
insert into unused_results values ('published_retry',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005201'));
insert into unused_results values ('main',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005203'));
insert into unused_results values ('body',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005204'));
insert into unused_results values ('history',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005205'));
reset role;
select is((select result->>'ok' from unused_results where label='published_list'),'true','publication does not hide unused uploads');
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
insert into unused_results select 'archived_list',public.list_unused_article_uploads(article_id) from unused_target;
insert into unused_results values ('archived_remove',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000005208'));
reset role;
select is((select result->>'code' from unused_results where label='archived_list'),'conflict','archived editor remains read-only');
select is((select result->>'code' from unused_results where label='archived_remove'),'conflict','archived cleanup mark denied');
select * from finish();
rollback;
