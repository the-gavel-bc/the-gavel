begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create temp table finalize_target as
select (public.create_article_draft('80000000-0000-0000-0000-000000000531',pg_temp.draft_input())->>'articleId')::uuid article_id,
  '60000000-0000-0000-0000-000000000053'::uuid asset_id;
grant select on finalize_target to service_role;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
select asset_id,article_id,'00000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000532',article_id||'/'||asset_id||'.webp','pending' from finalize_target;
insert into storage.objects(bucket_id,name,metadata)
select 'article-media',object_key,'{"mimetype":"image/webp","size":12}'::jsonb
from public.media_assets where id=(select asset_id from finalize_target);
create function pg_temp.finalize_proof(
  actor uuid default '00000000-0000-0000-0000-000000000002',
  hash text default repeat('a',64),size integer default 12,width integer default 2,height integer default 2
) returns jsonb language sql as $$
select public.finalize_article_image_upload(actor,asset_id,hash,size,width,height) from finalize_target;
$$;
grant execute on function pg_temp.finalize_proof(uuid,text,integer,integer,integer) to service_role;
select ok(not has_function_privilege('anon','public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)','EXECUTE'),'anonymous finalization stays denied');
select ok(not has_function_privilege('authenticated','public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)','EXECUTE'),'authenticated finalization stays denied');
select ok(has_function_privilege('service_role','public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)','EXECUTE'),'trusted finalization stays granted');
set local role service_role;
select is(pg_temp.finalize_proof('00000000-0000-0000-0000-000000000001')->>'code','forbidden','inactive actor denied');
select is(pg_temp.finalize_proof('00000000-0000-0000-0000-000000000003')->>'code','not_found','other uploader denied');
select is(public.finalize_article_image_upload('00000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000054',repeat('a',64),12,2,2)->>'code','not_found','missing locator fails closed');
select is(pg_temp.finalize_proof(hash=>'bad')->>'code','invalid_input','invalid hash denied');
select is(pg_temp.finalize_proof(size=>0)->>'code','invalid_input','empty object denied');
select is(pg_temp.finalize_proof(size=>10485761)->>'code','invalid_input','oversized object denied');
select is(pg_temp.finalize_proof(width=>0)->>'code','invalid_input','empty width denied');
select is(pg_temp.finalize_proof(height=>6001)->>'code','invalid_input','oversized height denied');
select is(pg_temp.finalize_proof(width=>6000,height=>6000)->>'code','invalid_input','excessive pixel count denied');
select is(pg_temp.finalize_proof(size=>13)->>'code','unavailable','Storage size attestation retained');
reset role;
update public.media_assets set uploader_user_id='00000000-0000-0000-0000-000000000003' where id=(select asset_id from finalize_target);
set local role service_role;
select is(pg_temp.finalize_proof('00000000-0000-0000-0000-000000000003')->>'code','not_found','uploader without article ownership denied');
select is(pg_temp.finalize_proof('00000000-0000-0000-0000-000000000004')->>'ok','true','administrator retains override for article and uploader');
select is(pg_temp.finalize_proof('00000000-0000-0000-0000-000000000004')->>'replayed','true','exact finalized retry remains replayable');
select is(pg_temp.finalize_proof('00000000-0000-0000-0000-000000000004',repeat('b',64))->>'code','request_conflict','changed finalized payload conflicts');
reset role;
select is((select status from public.media_assets where id=(select asset_id from finalize_target)),'finalized','successful finalization stores trusted state');
select * from finish();
rollback;
