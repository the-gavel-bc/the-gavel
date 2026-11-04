begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create temp table body_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000701',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on body_target to authenticated;
insert into public.articles(id,owner_profile_id,section_id,title,slug) values
  ('50000000-0000-0000-0000-000000000702','10000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000051','Foreign body asset','foreign-body-asset');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at) values
  ('60000000-0000-0000-0000-000000000701',(select article_id from body_target),
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000702',
  'body/701.webp','finalized',1234,120,90,repeat('a',64),now()),
  ('60000000-0000-0000-0000-000000000702',(select article_id from body_target),
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000703',
  'body/702.webp','pending',null,null,null,null,null),
  ('60000000-0000-0000-0000-000000000703','50000000-0000-0000-0000-000000000702',
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000709',
  'body/703.webp','finalized',1234,120,90,repeat('b',64),now()),
  ('60000000-0000-0000-0000-000000000704',(select article_id from body_target),
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000710',
  'body/704.webp','deleting',null,null,null,null,null);
create function pg_temp.body_image(p_asset uuid) returns jsonb language sql as $$
  select jsonb_build_object('format','gavel-draft','version',2,'document',jsonb_build_object(
    'type','doc','content',jsonb_build_array(jsonb_build_object('type','image','attrs',
      jsonb_build_object('assetId',p_asset,'alt','A photo','caption',null)))));
$$;
select is(private.is_valid_draft_document(pg_temp.body_image('60000000-0000-0000-0000-000000000701')),
  true,'canonical version 2 image shape is valid');
select is(private.is_valid_draft_document('{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph"}]}}'::jsonb),
  true,'legacy version 1 body remains valid');
select is(private.is_valid_draft_document(jsonb_set(pg_temp.body_image('60000000-0000-0000-0000-000000000701'),
  '{document,content,0,attrs,src}','"https://evil.example/x"'::jsonb)),false,'external image source is denied');
select is(private.is_valid_draft_document(jsonb_set(pg_temp.body_image('60000000-0000-0000-0000-000000000701'),
  '{document,content,0,attrs,alt}','" "'::jsonb)),false,'blank image alt is denied');
select is(private.is_valid_draft_document(jsonb_set(pg_temp.body_image('60000000-0000-0000-0000-000000000701'),
  '{document,content,0,attrs,caption}',to_jsonb(repeat('x',501)))),false,'oversized caption is denied');
select is(private.is_valid_draft_document(jsonb_set(pg_temp.body_image('60000000-0000-0000-0000-000000000701'),
  '{document,content}',jsonb_build_array(pg_temp.body_image('60000000-0000-0000-0000-000000000701') #> '{document,content,0}',
    pg_temp.body_image('60000000-0000-0000-0000-000000000701') #> '{document,content,0}'))),false,'duplicate image ID is denied');
create temp table body_results(label text primary key,result jsonb);
grant select,insert on body_results to authenticated;
set local role authenticated;
insert into body_results select 'pending',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000704',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000702')))) from body_target;
insert into body_results select 'foreign',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000711',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000703')))) from body_target;
insert into body_results select 'deleting',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000712',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000704')))) from body_target;
insert into body_results select 'missing',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000713',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000799')))) from body_target;
insert into body_results select 'valid',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000705',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000701')))) from body_target;
insert into body_results select 'retry',public.save_article_draft(article_id,1,
  '80000000-0000-0000-0000-000000000705',pg_temp.draft_input(jsonb_build_object(
    'content',pg_temp.body_image('60000000-0000-0000-0000-000000000701')))) from body_target;
reset role;
select is((select result->>'code' from body_results where label='pending'),'invalid_input','pending image cannot save');
select is((select result->>'code' from body_results where label='foreign'),'invalid_input','other article image cannot save');
select is((select result->>'code' from body_results where label='deleting'),'invalid_input','deleting image cannot save');
select is((select result->>'code' from body_results where label='missing'),'invalid_input','missing image cannot save');
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
select is(public.mark_article_image_for_removal('60000000-0000-0000-0000-000000000701')->>'code',
  'conflict','current body reference blocks cleanup');
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
insert into public.article_contributors(article_id,profile_id,contribution_role)
values ((select article_id from body_target),'10000000-0000-0000-0000-000000000003','writer');
set local role authenticated;
insert into body_results select 'credited_other',public.save_article_draft(article_id,2,
  '80000000-0000-0000-0000-000000000715',pg_temp.draft_input()) from body_target;
reset role;
select is((select result->>'code' from body_results where label='credited_other'),'not_found','credit grants no body edit authority');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
insert into body_results select 'inactive',public.save_article_draft(article_id,2,
  '80000000-0000-0000-0000-000000000714',pg_temp.draft_input()) from body_target;
reset role;
select is((select result->>'code' from body_results where label='inactive'),'forbidden','inactive author cannot edit body');
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000002';
select ok(not has_function_privilege('anon','public.save_article_draft(uuid,integer,uuid,jsonb)','EXECUTE'),
  'anonymous caller cannot save a body');
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
