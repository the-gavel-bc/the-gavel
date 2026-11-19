begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
select ok(not has_function_privilege('anon','public.claim_expired_unused_uploads(interval,integer)','EXECUTE'),
  'anonymous cannot claim expired uploads');
select ok(not has_function_privilege('authenticated','public.claim_expired_unused_uploads(interval,integer)','EXECUTE'),
  'members cannot claim expired uploads');
select ok(has_function_privilege('service_role','public.claim_expired_unused_uploads(interval,integer)','EXECUTE'),
  'the trusted job can claim');
select ok(not has_function_privilege('authenticated','public.complete_expired_unused_upload(uuid)','EXECUTE'),
  'members cannot complete an expiry');
create temp table expire_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000006601',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on expire_target to service_role;
-- 6601 old+unused, 6602 old+main image, 6603 old+body image, 6604 old+retained revision,
-- 6605 recent, 6606 old but still uploading, 6607 old and already deleting.
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at,created_at)
select ('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,article_id,
  '00000000-0000-0000-0000-000000000002',('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'expire/'||n||'.webp','finalized',1234,120,90,repeat('a',64),
  case when n=6605 then now() else now()-interval '10 days' end,
  case when n=6605 then now() else now()-interval '10 days' end
from expire_target cross join generate_series(6601,6607) n;
update public.media_assets set status='uploading',byte_size=null,width=null,height=null,sha256=null,finalized_at=null
  where id='60000000-0000-0000-0000-000000006606';
update public.media_assets set status='deleting',byte_size=null,width=null,height=null,sha256=null,finalized_at=null
  where id='60000000-0000-0000-0000-000000006607';
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000006602','Alt','Credit' from expire_target;
insert into public.article_body_images(article_id,asset_id)
select article_id,'60000000-0000-0000-0000-000000006603' from expire_target;
insert into public.article_revisions(article_id,actor_user_id,snapshot)
select article_id,'00000000-0000-0000-0000-000000000002',
  jsonb_set(private.capture_draft_snapshot(article_id),'{mainImage}',
    '{"assetId":"60000000-0000-0000-0000-000000006604","altText":"Alt","credit":"Credit"}'::jsonb)
from expire_target;

set local role service_role;
select throws_ok($$select * from public.claim_expired_unused_uploads(interval '1 hour',10)$$,
  '22023',null,'retention under a day is refused');
select throws_ok($$select * from public.claim_expired_unused_uploads(interval '7 days',0)$$,
  '22023',null,'batch size is bounded');
create temp table claimed as select * from public.claim_expired_unused_uploads(interval '7 days',25);
reset role;
select is((select array_agg(right(asset_id::text,4) order by asset_id) from claimed),
  array['6601','6607'],
  'only old unreferenced finalized images (and one stuck in deleting) are claimed');
select is((select status from public.media_assets where id='60000000-0000-0000-0000-000000006601'),'deleting',
  'a claimed image is hidden pending storage deletion');
select is((select count(*)::int from public.media_assets where id in
  ('60000000-0000-0000-0000-000000006602','60000000-0000-0000-0000-000000006603',
   '60000000-0000-0000-0000-000000006604','60000000-0000-0000-0000-000000006605',
   '60000000-0000-0000-0000-000000006606') and status<>'deleting'),5,
  'main, body, revision-retained, recent and still-uploading images are untouched');

-- Completion needs the object gone and no reference.
insert into storage.objects(bucket_id,name,owner) values('article-media','expire/6601.webp',null);
set local role service_role;
select is(public.complete_expired_unused_upload('60000000-0000-0000-0000-000000006601')->>'code','conflict',
  'completion refuses while the storage object exists');
select is(public.complete_expired_unused_upload('60000000-0000-0000-0000-000000006607')->>'ok','true',
  'completion deletes the row once the object is gone');
select is(public.complete_expired_unused_upload('60000000-0000-0000-0000-000000006607')->>'replayed','true',
  'completion is replay-safe');
select is(public.complete_expired_unused_upload('60000000-0000-0000-0000-000000006602')->>'code','conflict',
  'completion refuses an image the article uses');
reset role;
select is((select count(*)::int from private.media_expiry_log where asset_id='60000000-0000-0000-0000-000000006607'),1,
  'the expiry is recorded');

-- Archived articles keep their media; locked rows are skipped.
update public.articles set status='archived',published_at=now(),archived_at=now() where id=(select article_id from expire_target);
set local role service_role;
select is((select count(*)::int from public.claim_expired_unused_uploads(interval '7 days',25)),0,
  'archived articles keep their images');
reset role;
select * from finish();
rollback;
