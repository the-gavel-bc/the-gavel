begin;
select no_plan();
select has_function('public','list_public_sitemap_articles',array['timestamp with time zone','uuid','integer'],'sitemap article projection exists');
select has_function('public','list_public_sitemap_archives','sitemap archive projection exists');
select ok(has_function_privilege('anon','public.list_public_sitemap_articles(timestamptz,uuid,integer)','execute'),'anonymous can list sitemap articles');
select ok(has_function_privilege('authenticated','public.list_public_sitemap_archives()','execute'),'authenticated can list sitemap archives');
select ok(not has_table_privilege('anon','public.articles','select'),'anonymous direct article reads remain denied');

insert into public.sections(id,name,slug,active) values
 ('24000000-0000-0000-0000-000000000001','Sitemap news','sm-news',true),
 ('24000000-0000-0000-0000-000000000002','Sitemap empty','sm-empty',true),
 ('24000000-0000-0000-0000-000000000003','Sitemap hidden','sm-hidden',false);
insert into public.categories(id,section_id,name,slug,active) values
 ('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Sitemap cat','sm-cat',true),
 ('34000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000001','Sitemap empty cat','sm-empty-cat',true),
 ('34000000-0000-0000-0000-000000000003','24000000-0000-0000-0000-000000000001','Sitemap inactive cat','sm-inactive-cat',false),
 ('34000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000003','Sitemap hidden cat','sm-hidden-cat',true);
insert into public.tags(id,name,slug) values
 ('44000000-0000-0000-0000-000000000001','Sitemap tag','sm-tag'),
 ('44000000-0000-0000-0000-000000000002','Sitemap private tag','sm-tag-private'),
 ('44000000-0000-0000-0000-000000000003','Sitemap hidden-section tag','sm-tag-hidden-section'),
 ('44000000-0000-0000-0000-000000000004','Sitemap inactive-owner tag','sm-tag-inactive-owner');
insert into public.profiles(id,display_name,slug) values
 ('14000000-0000-0000-0000-000000000001','Sitemap owner','sm-owner'),
 ('14000000-0000-0000-0000-000000000002','Sitemap guest','sm-guest'),
 ('14000000-0000-0000-0000-000000000003','Sitemap draft credit','sm-draft-credit'),
 ('14000000-0000-0000-0000-000000000004','Sitemap inactive','sm-inactive');
-- Future timestamps keep fixture rows ahead of any seeded publications.
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at) values
 ('54000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','One','sm-one','published','2099-01-01T00:00:00.123456Z',null),
 ('54000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Two','sm-two','published','2099-01-01T00:00:00.123456Z',null),
 ('54000000-0000-0000-0000-000000000003','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Three','sm-three','published','2099-01-01T00:00:00.123457Z',null),
 ('54000000-0000-0000-0000-000000000004','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Draft','sm-draft','draft',null,null),
 ('54000000-0000-0000-0000-000000000005','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Archived','sm-archived','archived','2099-01-01T00:00:00Z',now()),
 ('54000000-0000-0000-0000-000000000006','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000003','Hidden section','sm-hidden-story','published','2099-01-01T00:00:00Z',null),
 ('54000000-0000-0000-0000-000000000007','14000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000001','Inactive owner','sm-inactive-story','published','2099-01-01T00:00:00Z',null),
 ('54000000-0000-0000-0000-000000000008','14000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Legacy null body','sm-null-body','published','2099-01-02T00:00:00Z',null);
-- Readable articles carry a valid body; sm-null-body models a legacy unavailable page.
update public.articles set content='{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph"}]}}'
where slug like 'sm-%' and slug<>'sm-null-body';
insert into public.article_categories(article_id,category_id,section_id) values
 ('54000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001'),
 ('54000000-0000-0000-0000-000000000002','34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001'),
 ('54000000-0000-0000-0000-000000000004','34000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000001'),
 ('54000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000003','24000000-0000-0000-0000-000000000001'),
 ('54000000-0000-0000-0000-000000000006','34000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000003');
insert into public.article_tags(article_id,tag_id) values
 ('54000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001'),
 ('54000000-0000-0000-0000-000000000002','44000000-0000-0000-0000-000000000001'),
 ('54000000-0000-0000-0000-000000000004','44000000-0000-0000-0000-000000000002'),
 ('54000000-0000-0000-0000-000000000005','44000000-0000-0000-0000-000000000002'),
 ('54000000-0000-0000-0000-000000000006','44000000-0000-0000-0000-000000000003'),
 ('54000000-0000-0000-0000-000000000007','44000000-0000-0000-0000-000000000004');
insert into public.article_contributors(article_id,profile_id,contribution_role) values
 ('54000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000002','writer'),
 ('54000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000002','editor'),
 ('54000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000002','writer'),
 ('54000000-0000-0000-0000-000000000004','14000000-0000-0000-0000-000000000003','writer');
update public.profiles set active=false where id='14000000-0000-0000-0000-000000000004';

create temporary table sitemap_proof(label text primary key,value jsonb);
grant select,insert on sitemap_proof to anon,authenticated;
set local role anon;
insert into sitemap_proof values
 ('archives',public.list_public_sitemap_archives()),
 ('page1',public.list_public_sitemap_articles(null,null,2)),
 ('all',public.list_public_sitemap_articles(null,null,1000));
insert into sitemap_proof select 'page2',public.list_public_sitemap_articles(
 (select (value#>>'{items,1,publishedAt}')::timestamptz from sitemap_proof where label='page1'),
 (select (value#>>'{items,1,id}')::uuid from sitemap_proof where label='page1'),2);
reset role;

-- Articles: visibility, ordering, ties and keyset continuation.
select is((select value->>'kind' from sitemap_proof where label='page1'),'ok','article page is available');
select is((select value#>>'{items,0,slug}' from sitemap_proof where label='page1'),'sm-three','microsecond ordering preserved');
select is((select value#>>'{items,1,slug}' from sitemap_proof where label='page1'),'sm-two','uuid breaks equal timestamp ties');
select is((select value#>>'{items,0,publishedAt}' from sitemap_proof where label='page1'),'2099-01-01T00:00:00.123457Z','lastmod keeps microseconds');
select ok((select (value->>'hasMore')::boolean from sitemap_proof where label='page1'),'full page reports more rows');
select is((select value#>>'{items,0,slug}' from sitemap_proof where label='page2'),'sm-one','continuation neither skips nor repeats ties');
select is((select array_agg(i->>'slug' order by i->>'slug') from sitemap_proof,jsonb_array_elements(value->'items') i
   where label='all' and i->>'slug' like 'sm-%'),array['sm-one','sm-three','sm-two'],
 'draft, archived, inactive-section, inactive-owner and NULL-body articles are absent');
select is((select count(*)::int from sitemap_proof,jsonb_array_elements(value->'items') i,jsonb_object_keys(i) k
   where label='page1' and k not in ('id','slug','publishedAt')),0,'no extra article fields');
select is(public.list_public_sitemap_articles(null,null,0)->>'kind','invalid','zero page rejected');
select is(public.list_public_sitemap_articles(null,null,1001)->>'kind','invalid','oversized page rejected');
select is(public.list_public_sitemap_articles(now(),null,10)->>'kind','invalid','partial cursor rejected');
select is(public.list_public_sitemap_articles(null,'54000000-0000-0000-0000-000000000001',10)->>'kind','invalid','partial cursor id rejected');

-- Archives: only active, non-empty and visible scopes.
select is((select value->>'kind' from sitemap_proof where label='archives'),'ok','archive sets are available');
select ok((select (value->'sections') ? 'sm-news' from sitemap_proof where label='archives'),'non-empty section listed');
select ok((select not (value->'sections') ?| array['sm-empty','sm-hidden'] from sitemap_proof where label='archives'),'empty and inactive sections absent');
select ok((select (value->'categories') @> '[{"section":"sm-news","slug":"sm-cat"}]' from sitemap_proof where label='archives'),'non-empty category listed with its section');
select is((select count(*)::int from sitemap_proof,jsonb_array_elements(value->'categories') c
   where label='archives' and c->>'slug' in ('sm-empty-cat','sm-inactive-cat','sm-hidden-cat')),0,
 'empty, inactive and hidden-section categories absent');
select ok((select (value->'tags') ? 'sm-tag' from sitemap_proof where label='archives'),'tag with visible article listed');
select ok((select not (value->'tags') ?| array['sm-tag-private','sm-tag-hidden-section','sm-tag-inactive-owner'] from sitemap_proof where label='archives'),
 'tags on only private or hidden articles absent');
select ok((select (value->'authors') ?& array['sm-owner','sm-guest'] from sitemap_proof where label='archives'),'owner and credited guest listed');
select ok((select not (value->'authors') ?| array['sm-draft-credit','sm-inactive'] from sitemap_proof where label='archives'),
 'draft-only credit and inactive profile absent');
select is((select count(*)::int from sitemap_proof,jsonb_array_elements_text(value->'authors') a
   where label='archives' and a in ('sm-owner','sm-guest')),2,'repeated credits do not duplicate authors');
select is((select count(*)::int from sitemap_proof,jsonb_array_elements_text(value->'tags') t
   where label='archives' and t='sm-tag'),1,'repeated tag links do not duplicate tags');

-- Signed-in callers see the same public projection.
set local role authenticated;
select is(public.list_public_sitemap_archives(),(select value from sitemap_proof where label='archives'),'authenticated archives match anonymous');
select is(public.list_public_sitemap_articles(null,null,1000),(select value from sitemap_proof where label='all'),'authenticated articles match anonymous');
reset role;

select * from finish();
rollback;
