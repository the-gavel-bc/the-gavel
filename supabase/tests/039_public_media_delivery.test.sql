begin;
select no_plan();
select has_function('public','get_public_article_media',array['uuid','uuid'],'public media projection exists');
insert into public.sections(id,name,slug) values('27000000-0000-0000-0000-000000000039','Media route proof','media-route-proof');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
values('57000000-0000-0000-0000-000000000039','10000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000039','Route proof','route-proof','published',now());
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
values('67000000-0000-0000-0000-000000000039','57000000-0000-0000-0000-000000000039','00000000-0000-0000-0000-000000000002','77000000-0000-0000-0000-000000000039','57000000-0000-0000-0000-000000000039/67000000-0000-0000-0000-000000000039.webp','finalized',42,1,1,repeat('a',64),now());
insert into public.article_main_images values('57000000-0000-0000-0000-000000000039','67000000-0000-0000-0000-000000000039','Proof','Synthetic');
insert into storage.objects(bucket_id,name,metadata) values('article-media','57000000-0000-0000-0000-000000000039/67000000-0000-0000-0000-000000000039.webp','{"cacheControl":"no-store"}');
set local role anon;
select is(public.get_public_article_media('57000000-0000-0000-0000-000000000039','67000000-0000-0000-0000-000000000039'),jsonb_build_object('kind','ok','byteSize',42,'sha256',repeat('a',64)),'anonymous projection is allowlisted');
select is(public.get_public_article_media('57000000-0000-0000-0000-000000000040','67000000-0000-0000-0000-000000000039')->>'kind','notFound','cross-article substitution denied');
select is(public.get_public_article_media(null,null)->>'kind','notFound','null ids are missing');
reset role;
set local role authenticated;
select is(public.get_public_article_media('57000000-0000-0000-0000-000000000039','67000000-0000-0000-0000-000000000039'),jsonb_build_object('kind','ok','byteSize',42,'sha256',repeat('a',64)),'authenticated public projection is identical');
reset role;
update public.articles set status='archived',archived_at=now() where slug='route-proof';
set local role anon;
select is(public.get_public_article_media('57000000-0000-0000-0000-000000000039','67000000-0000-0000-0000-000000000039')->>'kind','notFound','archive denies metadata projection');
reset role;
select * from finish();
rollback;
