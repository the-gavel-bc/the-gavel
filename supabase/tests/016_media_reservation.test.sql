begin;
select no_plan();
select has_table('public','media_assets','private article media assets have relational storage');
select has_function('public','request_article_image_upload',array['uuid','uuid'],
  'owner/admin media requests use a checked reservation RPC');
select has_function('public','finalize_article_image_upload',
  array['uuid','uuid','text','integer','integer','integer'],
  'only the trusted server can finalize validated bytes');
\ir support/draft-fixtures/draft-fixtures.inc
create temp table media_target as
select (public.create_article_draft('80000000-0000-0000-0000-000000000401',pg_temp.draft_input())->>'articleId')::uuid article_id;
create temp table media_results(label text primary key,result jsonb);
grant select,insert on media_results to authenticated,service_role;
grant select on media_target to authenticated,service_role;
set local role authenticated;
insert into media_results
select 'owner',public.request_article_image_upload(article_id,'80000000-0000-0000-0000-000000000402') from media_target;
insert into media_results
select 'repeat',public.request_article_image_upload(article_id,'80000000-0000-0000-0000-000000000402') from media_target;
insert into media_results
select 'new',public.request_article_image_upload(article_id,'80000000-0000-0000-0000-000000000403') from media_target;
reset role;
select is((select result->>'ok' from media_results where label='owner'),'true','owner reserves an upload');
select is((select result->>'assetId' from media_results where label='repeat'),
  (select result->>'assetId' from media_results where label='owner'),'exact request retry returns the same asset');
select is((select result->>'replayed' from media_results where label='repeat'),'true','retry is marked replayed');
select isnt((select result->>'assetId' from media_results where label='new'),
  (select result->>'assetId' from media_results where label='owner'),'new request gets a distinct generated asset ID');
select is((select count(*)::integer from public.media_assets),2,'two accepted requests reserve two rows');
select is((select count(distinct object_key)::integer from public.media_assets),2,'object keys are unique');
select ok((select bool_and(object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$') from public.media_assets),
  'object keys are generated from opaque article and asset IDs');
select ok(not has_table_privilege('authenticated','public.media_assets','INSERT'),'application role cannot directly insert trusted asset records');
select ok(not has_table_privilege('authenticated','public.media_assets','UPDATE'),'application role cannot directly finalize asset records');
select ok(not has_table_privilege('authenticated','public.media_assets','DELETE'),'application role cannot directly remove asset records');
create function pg_temp.attempt_storage_insert() returns text language plpgsql as $$
begin
  insert into storage.objects(bucket_id,name) values('article-media','forged.webp');
  return 'allowed';
exception when others then return sqlstate;
end;
$$;
grant execute on function pg_temp.attempt_storage_insert() to authenticated;
set local role authenticated;
select is(pg_temp.attempt_storage_insert(),'42501','authenticated caller cannot bypass the trusted Storage write path');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into media_results select 'other',public.request_article_image_upload(article_id,'80000000-0000-0000-0000-000000000404') from media_target;
reset role;
select is((select result->>'code' from media_results where label='other'),'not_found','other author cannot reserve an upload');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
insert into media_results select 'admin',public.request_article_image_upload(article_id,'80000000-0000-0000-0000-000000000405') from media_target;
reset role;
select is((select result->>'ok' from media_results where label='admin'),'true','active administrator can reserve on another draft');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into media_results select 'inactive',public.request_article_image_upload(article_id,'80000000-0000-0000-0000-000000000406') from media_target;
reset role;
select is((select result->>'code' from media_results where label='inactive'),'forbidden','inactive member cannot reserve');
select ok(not has_function_privilege('anon','public.request_article_image_upload(uuid,uuid)','EXECUTE'),
  'anonymous caller cannot execute reservation RPC');
select ok(not has_function_privilege('authenticated',
  'public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)','EXECUTE'),
  'authenticated clients cannot attest image validation');
select ok(has_function_privilege('service_role',
  'public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)','EXECUTE'),
  'trusted server role can call finalization');

set local role service_role;
insert into media_results
select 'missing_object',public.finalize_article_image_upload(
  '00000000-0000-0000-0000-000000000002',(result->>'assetId')::uuid,repeat('a',64),1234,120,90)
  from media_results where label='owner';
reset role;
select is((select result->>'code' from media_results where label='missing_object'),'unavailable',
  'a direct finalization call cannot trust a missing Storage object');
select is((select status from public.media_assets
  where id=(select (result->>'assetId')::uuid from media_results where label='owner')),'pending',
  'missing object leaves reservation untrusted');
insert into storage.objects(bucket_id,name,metadata)
select 'article-media',object_key,'{"mimetype":"image/webp","size":1234}'::jsonb
  from public.media_assets where id=(select (result->>'assetId')::uuid from media_results where label='owner');
set local role service_role;
insert into media_results
select 'wrong_actor',public.finalize_article_image_upload(
  '00000000-0000-0000-0000-000000000003',(result->>'assetId')::uuid,repeat('a',64),1234,120,90)
  from media_results where label='owner';
insert into media_results
select 'wrong_size',public.finalize_article_image_upload(
  '00000000-0000-0000-0000-000000000002',(result->>'assetId')::uuid,repeat('a',64),1235,120,90)
  from media_results where label='owner';
insert into media_results
select 'finalized',public.finalize_article_image_upload(
  '00000000-0000-0000-0000-000000000002',(result->>'assetId')::uuid,repeat('a',64),1234,120,90)
  from media_results where label='owner';
insert into media_results
select 'finalized_retry',public.finalize_article_image_upload(
  '00000000-0000-0000-0000-000000000002',(result->>'assetId')::uuid,repeat('a',64),1234,120,90)
  from media_results where label='owner';
reset role;
select is((select result->>'code' from media_results where label='wrong_actor'),'not_found',
  'service-role operation independently rejects another ordinary author');
select is((select result->>'code' from media_results where label='wrong_size'),'unavailable',
  'finalization rejects metadata that differs from stored object');
select is((select result->>'ok' from media_results where label='finalized'),'true',
  'trusted valid object becomes finalized');
select is((select result->>'replayed' from media_results where label='finalized_retry'),'true',
  'same trusted finalization is retry-safe');
select is((select status from public.media_assets
  where id=(select (result->>'assetId')::uuid from media_results where label='owner')),'finalized',
  'finalization stores verified metadata state');
select is((select public from storage.buckets where id='article-media'),false,
  'article image bucket is private');
insert into storage.objects(bucket_id,name,metadata)
select 'article-media',object_key,'{"mimetype":"image/webp","size":1234}'::jsonb
  from public.media_assets where id=(select (result->>'assetId')::uuid from media_results where label='new');
create temp table media_paths as
select r.label,a.object_key from media_results r join public.media_assets a
  on a.id=(r.result->>'assetId')::uuid where r.label in ('owner','new');
grant select on media_paths to authenticated;
select set_config('storage.operation','object.get_authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='article-media'
  and name=(select object_key from media_paths where label='owner')),1,
  'owner can download a finalized private object');
select is((select count(*)::integer from storage.objects where bucket_id='article-media'
  and name=(select object_key from media_paths where label='new')),0,
  'pending object stays hidden from its owner');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='article-media'
  and name=(select object_key from media_paths where label='owner')),0,
  'other author cannot download a finalized private object');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='article-media'
  and name=(select object_key from media_paths where label='owner')),1,
  'active administrator can download a private object');
reset role;
select * from finish();
rollback;
