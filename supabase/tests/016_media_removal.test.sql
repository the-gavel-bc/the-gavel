begin;
select no_plan();
select has_function('public','mark_article_image_for_removal',array['uuid'],
  'unused media is marked before trusted object deletion');
select has_function('public','complete_article_image_removal',array['uuid','uuid'],
  'trusted cleanup requires an absent object');
select ok(not has_function_privilege('authenticated','public.complete_article_image_removal(uuid,uuid)','EXECUTE'),
  'a browser cannot complete trusted cleanup');
\ir support/draft-fixtures/draft-fixtures.inc
create temp table media_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000601',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on media_target to authenticated,service_role;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at) values
  ('60000000-0000-0000-0000-000000000601',(select article_id from media_target),
    '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000602',
    'cleanup/601.webp','finalized',1234,120,90,repeat('a',64),now()),
  ('60000000-0000-0000-0000-000000000602',(select article_id from media_target),
    '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000603',
    'cleanup/602.webp','finalized',1234,120,90,repeat('b',64),now());
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
values ((select article_id from media_target),'60000000-0000-0000-0000-000000000601','Alt','Credit');
insert into storage.objects(bucket_id,name,metadata)
values ('article-media','cleanup/602.webp','{"mimetype":"image/webp","size":1234}'::jsonb);
create temp table results(label text primary key,result jsonb);
grant select,insert on results to authenticated,service_role;
set local role authenticated;
insert into results values ('linked',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000601'));
insert into results values ('unused',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000602'));
insert into results values ('retry',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000602'));
reset role;
select is((select result->>'code' from results where label='linked'),'conflict',
  'referenced image cannot enter cleanup');
select is((select status from public.media_assets where id='60000000-0000-0000-0000-000000000601'),
  'finalized','referenced image remains readable');
delete from public.article_main_images where asset_id='60000000-0000-0000-0000-000000000601';
insert into public.article_revisions(article_id,actor_user_id,snapshot)
select article_id,'00000000-0000-0000-0000-000000000002',
  jsonb_set(private.capture_draft_snapshot(article_id),'{mainImage}',
    '{"assetId":"60000000-0000-0000-0000-000000000601","altText":"Alt","credit":"Credit"}'::jsonb)
from media_target;
set local role authenticated;
insert into results values ('historical',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000601'));
reset role;
select is((select result->>'code' from results where label='historical'),'conflict',
  'an image retained in a revision cannot be deleted after unlinking');
select is((select count(*)::integer from private.article_revision_media_refs
  where asset_id='60000000-0000-0000-0000-000000000601'),1,
  'revision insertion captures a relational image retention link');
select is((select result->>'ok' from results where label='unused'),'true','unused image enters cleanup');
select is((select result->>'replayed' from results where label='retry'),'true','mark retries are idempotent');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into results values ('other',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000601'));
reset role;
select is((select result->>'code' from results where label='other'),'not_found','other author cannot mark a foreign image');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into results values ('inactive',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000602'));
reset role;
select is((select result->>'code' from results where label='inactive'),'forbidden',
  'inactive caller cannot mark an image');
set local role service_role;
insert into results values ('wrong_actor',public.complete_article_image_removal(
  '00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000602'));
insert into results values ('object_present',public.complete_article_image_removal(
  '00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000602'));
reset role;
select is((select result->>'code' from results where label='wrong_actor'),'not_found',
  'trusted completion independently rejects another author');
select is((select result->>'code' from results where label='object_present'),'conflict',
  'trusted completion refuses to clear a row while the object exists');
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects where bucket_id='article-media' and name='cleanup/602.webp';
set local role service_role;
insert into results values ('complete',public.complete_article_image_removal(
  '00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000602'));
insert into results values ('complete_retry',public.complete_article_image_removal(
  '00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000602'));
reset role;
select is((select result->>'ok' from results where label='complete'),'true','trusted cleanup clears the unused row');
select is((select result->>'replayed' from results where label='complete_retry'),'true','completion is retryable');
select is((select count(*)::integer from public.media_assets where id='60000000-0000-0000-0000-000000000602'),0,
  'removed asset row is gone');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key)
values ('60000000-0000-0000-0000-000000000603',(select article_id from media_target),
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000604','cleanup/603.webp');
set local role service_role;
insert into results values ('claimed',public.begin_article_image_upload(
  '00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000603'));
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
insert into results values ('uploading',public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000603'));
reset role;
select is((select result->>'ok' from results where label='claimed'),'true',
  'trusted route claims pending asset before Storage upload');
select is((select result->>'ok' from results where label='uploading'),'true',
  'explicit cancellation retires an unreferenced claimed upload');
select is((select status from public.media_assets where id='60000000-0000-0000-0000-000000000603'),'deleting','cancellation fences future finalization');
select * from finish();
rollback;
