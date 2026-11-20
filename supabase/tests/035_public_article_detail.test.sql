begin;
select no_plan();
select has_function('public', 'get_public_article', array['text'], 'public article detail projection exists');
select ok(has_function_privilege('anon','public.get_public_article(text)','execute'), 'anonymous can execute projection');
select ok(has_function_privilege('authenticated','public.get_public_article(text)','execute'), 'authenticated can execute projection');
select ok(not has_table_privilege('anon','public.articles','select'), 'anonymous cannot select articles directly');
insert into public.sections(id,name,slug) values ('23000000-0000-0000-0000-000000000035','Projection section','projection-section');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,content)
values
('53000000-0000-0000-0000-000000000035','10000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000035','Public story','projection-public','published',now(),
 '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Public body"}]}]}}'),
('53000000-0000-0000-0000-000000000036','10000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000035','Broken story','projection-broken','published',now(),'{"unsupported":true}');
insert into public.articles(id,owner_profile_id,section_id,title,slug)
values ('53000000-0000-0000-0000-000000000037','10000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000035','Private story','projection-private');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
values ('63000000-0000-0000-0000-000000000035','53000000-0000-0000-0000-000000000035','00000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000035',
  '53000000-0000-0000-0000-000000000035/63000000-0000-0000-0000-000000000035.webp','finalized',12,2,3,repeat('a',64),now());
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
values ('53000000-0000-0000-0000-000000000035','63000000-0000-0000-0000-000000000035','Photo','Photographer');
create temporary table projection_result(value jsonb);
grant select,insert on projection_result to anon,authenticated;
set local role anon;
insert into projection_result values (public.get_public_article('projection-public'));
select is(public.get_public_article('projection-public')->>'kind','ok','anonymous reads published article');
select is(public.get_public_article('projection-private')->>'kind','notFound','draft is not found');
select is(public.get_public_article('projection-missing')->>'kind','notFound','unknown slug is not found');
select is(public.get_public_article('Invalid slug')->>'kind','notFound','malformed slug is not found');
select is(public.get_public_article(null)->>'kind','notFound','null slug is not found');
select is(public.get_public_article('projection-broken')->>'kind','unavailable','invalid published body is unavailable');
select is(public.get_public_article('projection-broken') ? 'article',false,'invalid body is not returned');
select is(public.get_public_article('projection-public')#>>'{article,title}','Public story','public title returned');
select is(public.get_public_article('projection-public')#>>'{article,mainImage,alt}','Photo','safe main image descriptor returned');
select is(public.get_public_article('projection-public')#>>'{article,content,document,content,0,content,0,text}','Public body','public body returned');
select ok(public.get_public_article('projection-public')::text !~ 'auth_user_id|owner_profile_id|object_key|seo_keyphrase|uploader_user_id',
  'private fields excluded');
select throws_ok($$select * from public.articles$$,'42501',null,'direct anonymous article read denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.get_public_article('projection-public'),(select value from projection_result),'authenticated projection matches anonymous');
select is(public.get_public_article('projection-private')->>'kind','notFound','administrator sees no private article through public projection');
reset role;
update public.articles set content='{"format":"gavel-draft","version":2,"document":{"type":"doc","content":[{"type":"image","attrs":{"assetId":"63000000-0000-0000-0000-000000000035","alt":"Photo","caption":null}}]}}'
  where slug='projection-public';
set local role anon;
select is(public.get_public_article('projection-public')->>'kind','unavailable','missing current body image link fails closed');
reset role;
insert into public.article_body_images(article_id,asset_id)
values ('53000000-0000-0000-0000-000000000035','63000000-0000-0000-0000-000000000035');
set local role anon;
select is(public.get_public_article('projection-public')#>>'{article,bodyImages,0,width}','2','current finalized body image descriptor returned');
reset role;
update public.profiles set active=false where id='10000000-0000-0000-0000-000000000002';
set local role anon;
select is(public.get_public_article('projection-public')->>'kind','unavailable','inactive owner fails closed for current article detail');
select is(public.get_public_article('projection-public') ? 'article',false,'inactive owner data is not projected');
reset role;
update public.profiles set active=true where id='10000000-0000-0000-0000-000000000002';
update public.sections set active=false where id='23000000-0000-0000-0000-000000000035';
set local role anon;
select is(public.get_public_article('projection-public')->>'kind','unavailable','inactive section fails closed for current article detail');
select is(public.get_public_article('projection-public') ? 'article',false,'inactive section data is not projected');
reset role;
update public.sections set active=true where id='23000000-0000-0000-0000-000000000035';
update public.articles set status='archived',archived_at=now() where slug='projection-public';
set local role anon;
select is(public.get_public_article('projection-public')->>'kind','notFound','archived article disappears');
reset role;
select * from finish();
rollback;
