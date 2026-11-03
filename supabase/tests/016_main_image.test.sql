begin;
select no_plan();
select has_table('public','article_main_images','main image attachment has a relational reference');
select has_function('public','set_article_main_image',
  array['uuid','integer','uuid','uuid','text','text'],
  'main image changes use one versioned checked operation');
\ir support/draft-fixtures/draft-fixtures.inc
create temp table image_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000501',pg_temp.draft_input())->>'articleId')::uuid article_id;
grant select on image_target to authenticated;
insert into public.articles(id,owner_profile_id,section_id,title,slug)
values ('50000000-0000-0000-0000-000000000502','10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000051','Other media article','other-media-article');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at) values
  ('60000000-0000-0000-0000-000000000501',(select article_id from image_target),
    '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000502',
    'main/501.webp','finalized',1234,120,90,repeat('a',64),now()),
  ('60000000-0000-0000-0000-000000000502',(select article_id from image_target),
    '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000503',
    'main/502.webp','pending',null,null,null,null,null),
  ('60000000-0000-0000-0000-000000000503','50000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000504',
    'main/503.webp','finalized',1234,120,90,repeat('b',64),now());
create temp table image_results(label text primary key,result jsonb);
grant select,insert on image_results to authenticated;
set local role authenticated;
insert into image_results select 'pending',public.set_article_main_image(article_id,1,
  '80000000-0000-0000-0000-000000000505','60000000-0000-0000-0000-000000000502','Alt','Credit') from image_target;
insert into image_results select 'foreign',public.set_article_main_image(article_id,1,
  '80000000-0000-0000-0000-000000000506','60000000-0000-0000-0000-000000000503','Alt','Credit') from image_target;
insert into image_results select 'blank_alt',public.set_article_main_image(article_id,1,
  '80000000-0000-0000-0000-000000000507','60000000-0000-0000-0000-000000000501',' ','Credit') from image_target;
insert into image_results select 'attached',public.set_article_main_image(article_id,1,
  '80000000-0000-0000-0000-000000000508','60000000-0000-0000-0000-000000000501','Newsroom graphic','The Gavel') from image_target;
insert into image_results select 'replay',public.set_article_main_image(article_id,1,
  '80000000-0000-0000-0000-000000000508','60000000-0000-0000-0000-000000000501','Newsroom graphic','The Gavel') from image_target;
insert into image_results select 'stale',public.set_article_main_image(article_id,1,
  '80000000-0000-0000-0000-000000000509',null,null,null) from image_target;
insert into image_results select 'noop',public.set_article_main_image(article_id,2,
  '80000000-0000-0000-0000-000000000510','60000000-0000-0000-0000-000000000501','Newsroom graphic','The Gavel') from image_target;
reset role;
select is((select result->>'code' from image_results where label='pending'),'invalid_input','pending image cannot attach');
select is((select result->>'code' from image_results where label='foreign'),'invalid_input','other article image cannot attach');
select is((select result->>'code' from image_results where label='blank_alt'),'invalid_input','blank alt text cannot attach');
select is((select result->>'version' from image_results where label='attached'),'2','attachment increments version once');
select is((select result->>'replayed' from image_results where label='replay'),'true','exact image mutation retry replays');
select is((select result->>'code' from image_results where label='stale'),'conflict','stale image removal is denied');
select is((select result->>'changed' from image_results where label='noop'),'false','same image and metadata is a no-op');
select is((select result->>'version' from image_results where label='noop'),'2','no-op keeps version');
select is((select asset_id from public.article_main_images where article_id=(select article_id from image_target)),
  '60000000-0000-0000-0000-000000000501'::uuid,'relational link stores the finalized asset');
select is((select snapshot->'mainImage'->>'altText' from public.article_revisions
  where article_id=(select article_id from image_target)
    and (snapshot->'article'->>'editVersion')::integer=2),
  'Newsroom graphic','new revision captures main-image metadata');
select is((select count(*)::integer from public.article_revisions where article_id=(select article_id from image_target)),
  2,'only changed attachment adds a revision');
select is((select count(*)::integer from private.media_write_receipts),2,'changed and no-op requests have exact receipts');
select ok(not has_table_privilege('authenticated','public.article_main_images','INSERT'),
  'application cannot directly attach a main image');
select ok(not has_table_privilege('authenticated','public.article_main_images','DELETE'),
  'application cannot directly remove a main image');
create function pg_temp.try_delete_attached_asset() returns text language plpgsql as $$
begin
  delete from public.media_assets where id='60000000-0000-0000-0000-000000000501';
  return 'deleted';
exception when others then return sqlstate;
end;
$$;
select is(pg_temp.try_delete_attached_asset(),'23503','referenced asset cannot be deleted');
insert into public.article_contributors(article_id,profile_id,contribution_role)
values ((select article_id from image_target),'10000000-0000-0000-0000-000000000003','writer');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into image_results select 'credited_other',public.set_article_main_image(article_id,2,
  '80000000-0000-0000-0000-000000000511',null,null,null) from image_target;
reset role;
select is((select result->>'code' from image_results where label='credited_other'),'not_found',
  'credited non-owner cannot remove the main image');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into image_results select 'inactive',public.set_article_main_image(article_id,2,
  '80000000-0000-0000-0000-000000000512',null,null,null) from image_target;
reset role;
select is((select result->>'code' from image_results where label='inactive'),'forbidden',
  'inactive member cannot mutate main image');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
insert into image_results select 'admin_remove',public.set_article_main_image(article_id,2,
  '80000000-0000-0000-0000-000000000513',null,null,null) from image_target;
reset role;
select is((select result->>'version' from image_results where label='admin_remove'),'3',
  'administrator can remove main image with version check');
select is((select count(*)::integer from public.article_main_images),0,
  'removal clears relational reference');
select is((select count(*)::integer from public.article_revisions where article_id=(select article_id from image_target)),
  3,'removal adds one revision');
select * from finish();
rollback;
