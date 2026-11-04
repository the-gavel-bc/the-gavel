begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create temp table body_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000701',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on body_target to authenticated;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at) values
  ('60000000-0000-0000-0000-000000000701',(select article_id from body_target),
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000702',
  'body/701.webp','finalized',1234,120,90,repeat('a',64),now()),
  ('60000000-0000-0000-0000-000000000702',(select article_id from body_target),
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000703',
  'body/702.webp','pending',null,null,null,null,null);
create function pg_temp.body_image(p_asset uuid) returns jsonb language sql as $$
  select jsonb_build_object('format','gavel-draft','version',2,'document',jsonb_build_object(
    'type','doc','content',jsonb_build_array(jsonb_build_object('type','image','attrs',
      jsonb_build_object('assetId',p_asset,'alt','A photo','caption',null)))));
$$;
select is(private.is_valid_draft_document(pg_temp.body_image('60000000-0000-0000-0000-000000000701')),
  true,'canonical version 2 image shape is valid');
select is(private.is_valid_draft_document(jsonb_set(pg_temp.body_image('60000000-0000-0000-0000-000000000701'),
  '{document,content,0,attrs,src}','"https://evil.example/x"'::jsonb)),false,'external image source is denied');
create temp table body_results(label text primary key,result jsonb);
grant select,insert on body_results to authenticated;
set local role authenticated;
insert into body_results select 'pending',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000704',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000702')))) from body_target;
insert into body_results select 'valid',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000705',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000701')))) from body_target;
insert into body_results select 'retry',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000705',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000701')))) from body_target;
reset role;
select is((select result->>'code' from body_results where label='pending'),'invalid_input','pending image cannot save');
select is((select result->>'ok' from body_results where label='valid'),'true','finalized image saves');
select is((select result->>'replayed' from body_results where label='retry'),'true','exact retry replays');
select is((select count(*)::integer from public.article_body_images where article_id=(select article_id from body_target)),
  1,'body reference is relational');
select is((select count(*)::integer from private.article_revision_media_refs
  where asset_id='60000000-0000-0000-0000-000000000701'),1,'revision retains body asset reference');
select ok(not has_table_privilege('authenticated','public.article_body_images','INSERT'),
  'browser cannot directly attach body media');
select ok(not has_table_privilege('authenticated','public.article_body_images','DELETE'),
  'browser cannot directly remove body media');
select is((select result->>'version' from body_results where label='valid'),'2','body save increments version once');
select is((select count(*)::integer from public.article_revisions where article_id=(select article_id from body_target)),
  2,'exact retry adds no revision');
set local role authenticated;
insert into body_results select 'stale',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000706',pg_temp.draft_input()) from body_target;
reset role;
select is((select result->>'code' from body_results where label='stale'),'conflict','stale body save preserves references');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into body_results select 'other_owner',public.save_article_draft(article_id,2,
  '80000000-0000-0000-0000-000000000707',pg_temp.draft_input()) from body_target;
reset role;
select is((select result->>'code' from body_results where label='other_owner'),'not_found','other author cannot change body image');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
insert into body_results select 'removed',public.save_article_draft(article_id,2,
  '80000000-0000-0000-0000-000000000708',pg_temp.draft_input()) from body_target;
reset role;
select is((select result->>'ok' from body_results where label='removed'),'true','owner can remove current image block');
select is((select count(*)::integer from public.article_body_images where article_id=(select article_id from body_target)),
  0,'current relational reference is removed with body');
select is(public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000701')->>'code',
  'conflict','historical body image cannot be removed');
select * from finish();
rollback;
