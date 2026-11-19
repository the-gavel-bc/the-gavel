begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
-- Publishing and editing published articles are editor/administrator powers; these cases act as an administrator.
update public.memberships set role='administrator' where user_id='00000000-0000-0000-0000-000000000002';
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,content)
values ('60000000-0000-0000-0000-000000000060','10000000-0000-0000-0000-000000000002',
 '20000000-0000-0000-0000-000000000051','Published photo proof','published-photo-proof','published',now(),
 '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Published photo proof body"}]}]}}');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
values ('61000000-0000-0000-0000-000000000060','60000000-0000-0000-0000-000000000060',
 '00000000-0000-0000-0000-000000000002',gen_random_uuid(),
 '60000000-0000-0000-0000-000000000060/61000000-0000-0000-0000-000000000060.webp','finalized',12,2,2,repeat('a',64),now());
insert into storage.objects(bucket_id,name,metadata)
values ('article-media','60000000-0000-0000-0000-000000000060/61000000-0000-0000-0000-000000000060.webp',
 '{"mimetype":"image/webp","size":12,"cacheControl":"no-store"}');
insert into public.article_contributors(article_id,profile_id,contribution_role) values ('60000000-0000-0000-0000-000000000060','10000000-0000-0000-0000-000000000003','writer');
create function pg_temp.attach_photo(asset uuid,version integer,request uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.set_article_main_image('60000000-0000-0000-0000-000000000060',version,request,
 asset,case when asset is null then null else 'Public photo' end,
 case when asset is null then null else 'The Gavel' end,case when asset is null then null else 'Public caption' end);
$$;
grant execute on function pg_temp.attach_photo(uuid, integer, uuid) to authenticated;
set local role authenticated;
select is(pg_temp.attach_photo('61000000-0000-0000-0000-000000000060',1)->>'version','2','published initial attachment increments version');
reset role;
create temp table photo_target as select
 (public.request_article_image_upload('60000000-0000-0000-0000-000000000060',gen_random_uuid())->>'assetId')::uuid asset_id;
grant select on photo_target to authenticated,service_role;
create function pg_temp.user_photo(operation text) returns jsonb language sql as $$
 select case operation
 when 'reserve' then public.request_article_image_upload('60000000-0000-0000-0000-000000000060',gen_random_uuid())
 when 'admit' then public.admit_article_image_upload('60000000-0000-0000-0000-000000000060',(select asset_id from photo_target))
 else pg_temp.attach_photo((select asset_id from photo_target),2) end;
$$;
grant execute on function pg_temp.user_photo(text) to authenticated;
create function pg_temp.trusted_photo(operation text,actor uuid) returns jsonb language sql as $$
 select case operation when 'begin' then public.begin_article_image_upload(actor,(select asset_id from photo_target))
 else public.finalize_article_image_upload(actor,(select asset_id from photo_target),repeat('b',64),12,2,2) end;
$$;
grant execute on function pg_temp.trusted_photo(text, uuid) to service_role;
select ok(not has_function_privilege('anon',signature,'execute'),'anonymous denied '||signature)
 from unnest(array['public.request_article_image_upload(uuid,uuid)','public.admit_article_image_upload(uuid,uuid)',
 'public.set_article_main_image(uuid,integer,uuid,uuid,text,text,text)',
 'public.begin_article_image_upload(uuid,uuid)','public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)']) signature;
select ok(not has_function_privilege('authenticated',signature,'execute'),'trusted-only '||signature)
 from unnest(array['public.begin_article_image_upload(uuid,uuid)','public.finalize_article_image_upload(uuid,uuid,text,integer,integer,integer)']) signature;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select is(pg_temp.user_photo(op)->>'code','forbidden','missing identity denied '||op) from unnest(array['reserve','admit','attach']) op;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select is(pg_temp.user_photo(op)->>'code','forbidden','inactive member denied '||op) from unnest(array['reserve','admit','attach']) op;
reset role;
set local role service_role;
select is(pg_temp.trusted_photo(op,'00000000-0000-0000-0000-000000000001')->>'code','forbidden','trusted inactive actor denied '||op) from unnest(array['begin','finalize']) op;
reset role;
update auth.users set raw_app_meta_data='{"provider":"email"}' where id='00000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is(pg_temp.user_photo(op)->>'code','forbidden','ineligible identity denied '||op) from unnest(array['reserve','admit','attach']) op;
reset role;
set local role service_role;
select is(pg_temp.trusted_photo(op,'00000000-0000-0000-0000-000000000002')->>'code','forbidden','trusted ineligible actor denied '||op) from unnest(array['begin','finalize']) op;
reset role;
update auth.users set raw_app_meta_data='{"provider":"google","providers":["google"]}' where id='00000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select is(pg_temp.user_photo(op)->>'code','not_found','credited non-owner denied '||op) from unnest(array['reserve','admit','attach']) op;
reset role;
set local role service_role;
select is(pg_temp.trusted_photo(op,'00000000-0000-0000-0000-000000000003')->>'code','not_found','trusted non-owner denied '||op) from unnest(array['begin','finalize']) op;
reset role;
-- A linked but deactivated public identity cannot retain upload authority.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update public.profiles set active=false where auth_user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select is(pg_temp.user_photo(op)->>'code','forbidden','inactive profile denied '||op) from unnest(array['reserve','admit','attach']) op;
reset role;
set local role service_role;
select is(pg_temp.trusted_photo(op,'00000000-0000-0000-0000-000000000002')->>'code','forbidden','trusted inactive profile denied '||op) from unnest(array['begin','finalize']) op;
select is(pg_temp.trusted_photo(op,null)->>'code','forbidden','trusted missing actor denied '||op) from unnest(array['begin','finalize']) op;
reset role;
update public.profiles set active=true where auth_user_id='00000000-0000-0000-0000-000000000002';
-- Neither ownership nor the editor role permits processing another uploader's reservation.
update public.memberships set role='editor' where user_id='00000000-0000-0000-0000-000000000002';
update public.media_assets set uploader_user_id='00000000-0000-0000-0000-000000000003' where id=(select asset_id from photo_target);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is(pg_temp.user_photo('admit')->>'code','not_found','owner cannot process another uploader reservation');
reset role;
set local role service_role;
select is(pg_temp.trusted_photo('begin','00000000-0000-0000-0000-000000000002')->>'code','not_found','owner cannot claim another uploader reservation');
select is(pg_temp.trusted_photo('finalize','00000000-0000-0000-0000-000000000002')->>'code','not_found','owner cannot finalize another uploader reservation');
reset role;
update public.memberships set role='administrator' where user_id='00000000-0000-0000-0000-000000000002';
update public.media_assets set uploader_user_id='00000000-0000-0000-0000-000000000002' where id=(select asset_id from photo_target);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(pg_temp.user_photo('reserve')->>'ok','true','administrator can reserve published photo');
select is(pg_temp.user_photo('admit')->>'ok','true','administrator can admit owner upload');
reset role;
set local role service_role;
select is(pg_temp.trusted_photo('begin','00000000-0000-0000-0000-000000000004')->>'ok','true','administrator can claim owner upload');
reset role;
insert into storage.objects(bucket_id,name,metadata)
select 'article-media',object_key,'{"mimetype":"image/webp","size":12,"cacheControl":"no-store"}'::jsonb
 from public.media_assets where id=(select asset_id from photo_target);
set local role service_role;
select is(pg_temp.trusted_photo('finalize','00000000-0000-0000-0000-000000000004')->>'ok','true','administrator can finalize owner upload');
select is(pg_temp.trusted_photo('finalize','00000000-0000-0000-0000-000000000004')->>'replayed','true','trusted finalization exact replay');
reset role;
select is(public.get_public_article_media('60000000-0000-0000-0000-000000000060',(select asset_id from photo_target))->>'kind','notFound','finalized unattached upload stays private');
set local role anon;
select set_config('storage.operation','object.get_authenticated',true);
select is((select count(*) from storage.objects where name like '60000000-0000-0000-0000-000000000060/%'),1::bigint,'only old current image publicly readable before attach');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is(pg_temp.attach_photo((select asset_id from photo_target),2,'62000000-0000-0000-0000-000000000060')->>'version','3','replacement commits link and version');
select is(pg_temp.attach_photo((select asset_id from photo_target),2,'62000000-0000-0000-0000-000000000060')->>'replayed','true','published replacement retry replays');
select is(pg_temp.attach_photo(null,2)->>'code','conflict','stale removal conflicts');
reset role;
select is((select snapshot#>>'{mainImage,assetId}' from public.article_revisions where article_id='60000000-0000-0000-0000-000000000060' and snapshot#>>'{article,editVersion}'='3'),(select asset_id::text from photo_target),'replacement revision references new image');
select is((select count(*) from private.article_revision_media_refs where asset_id='61000000-0000-0000-0000-000000000060'),1::bigint,'old revision reference retained');
select is(public.get_public_article_media('60000000-0000-0000-0000-000000000060','61000000-0000-0000-0000-000000000060')->>'kind','notFound','replaced origin image becomes private');
select is(public.get_public_article_media('60000000-0000-0000-0000-000000000060',(select asset_id from photo_target))->>'kind','ok','new image public after attach');
select is(public.get_public_article('published-photo-proof')#>>'{article,mainImage,id}',(select asset_id::text from photo_target),'article detail observes replacement');
select is(public.get_public_homepage()#>>'{lead,mainImage,id}',(select asset_id::text from photo_target),'homepage observes replacement');
select set_config('request.path','/rpc/search_public_articles',true);
select set_config('request.method','POST',true);
select is(public.search_public_articles('Published photo proof')#>>'{items,0,mainImage,id}',(select asset_id::text from photo_target),'search observes replacement');
select ok(exists(select 1 from jsonb_array_elements(public.list_public_sitemap_articles(null,null,100)->'items') item
 where item->>'slug'='published-photo-proof'),'sitemap retains published article after replacement');
set local role authenticated;
select is(public.mark_article_image_for_removal('61000000-0000-0000-0000-000000000060')->>'code','conflict','old revision prevents cleanup');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(pg_temp.attach_photo(null,3)->>'version','4','administrator can remove published main image');
reset role;
select is(public.get_public_article_media('60000000-0000-0000-0000-000000000060',(select asset_id from photo_target))->>'kind','notFound','removed image no longer served at origin');
select is((select count(*) from private.article_revision_media_refs where asset_id=(select asset_id from photo_target)),1::bigint,'removed image retained by earlier revision');
set local role authenticated;
select is(public.mark_article_image_for_removal((select asset_id from photo_target))->>'code','conflict','removed revision image cannot be cleaned');
reset role;
update public.articles set status='archived',archived_at=now() where id='60000000-0000-0000-0000-000000000060';
set local role authenticated;
select is(pg_temp.user_photo(op)->>'code','conflict','archived new operation denied '||op) from unnest(array['reserve','admit','attach']) op;
reset role;
set local role service_role;
select is(pg_temp.trusted_photo(op,'00000000-0000-0000-0000-000000000004')->>'code','conflict','archived trusted operation denied '||op) from unnest(array['begin','finalize']) op;
reset role;
select * from finish();
rollback;
