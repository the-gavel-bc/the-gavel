begin;
select no_plan();
insert into public.sections(id,name,slug,active) values
 ('2b000000-0000-0000-0000-000000000044','Sectionalpha','search-alpha',true),
 ('2b000000-0000-0000-0000-000000000045','Hiddensectionalpha','search-hidden',false);
insert into public.profiles(id,display_name,slug) values
 ('1b000000-0000-0000-0000-000000000001','Owneralpha','search-owner'),
 ('1b000000-0000-0000-0000-000000000002','Writeralpha','search-writer'),
 ('1b000000-0000-0000-0000-000000000003','Editoronlyalpha','search-editor'),
 ('1b000000-0000-0000-0000-000000000004','Inactiveowner','search-inactive');
insert into public.tags(id,name,slug) values('4b000000-0000-0000-0000-000000000044','Tagalpha','search-tag');
insert into public.categories(id,section_id,name,slug) values('3b000000-0000-0000-0000-000000000044','2b000000-0000-0000-0000-000000000044','Categoryalpha','search-category');
insert into public.articles(id,owner_profile_id,section_id,title,slug,excerpt,meta_description,content,status,published_at,archived_at)
select ('5b000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case when n=6 then '1b000000-0000-0000-0000-000000000004'::uuid else '1b000000-0000-0000-0000-000000000001'::uuid end,
 case when n=5 then '2b000000-0000-0000-0000-000000000045'::uuid else '2b000000-0000-0000-0000-000000000044'::uuid end,
 case n when 1 then 'Titlealpha' when 2 then 'Otheralpha cross-field' when 3 then 'Privatealpha' when 4 then 'Archivealpha' when 5 then 'Hiddenalpha' else 'Inactivealpha' end,
 'search-case-'||n,case when n=1 then 'Excerptalpha' else null end,case when n=1 then 'Descriptionalpha' else null end,
 '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Bodyalpha"}]}]}}',
 case n when 3 then 'draft'::public.article_status when 4 then 'archived'::public.article_status else 'published'::public.article_status end,
 case when n!=3 then '2026-11-10T00:00:00Z'::timestamptz+n*interval '1 microsecond' else null end,
 case when n=4 then now() else null end from generate_series(1,6) n;
update public.articles set seo_keyphrase='Privatekeyphrasealpha' where slug='search-case-1';
-- Simulate a legacy inactive public reference with privileged fixture setup.
update public.profiles set active=false where slug='search-inactive';
insert into public.article_contributors(article_id,profile_id,contribution_role) values
 ('5b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000002','writer'),
 ('5b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000002','editor'),
 ('5b000000-0000-0000-0000-000000000001','1b000000-0000-0000-0000-000000000003','editor');
insert into public.article_tags values('5b000000-0000-0000-0000-000000000001','4b000000-0000-0000-0000-000000000044');
insert into public.article_categories(article_id,category_id,section_id) values('5b000000-0000-0000-0000-000000000001','3b000000-0000-0000-0000-000000000044','2b000000-0000-0000-0000-000000000044');
select is((select count(*)::int from private.search_article_candidates(array['titlealpha'])),1,'title match');
select is((select count(*)::int from private.search_article_candidates(array['excerptalpha'])),1,'excerpt match');
select is((select count(*)::int from private.search_article_candidates(array['descriptionalpha'])),1,'metadata description match');
select is((select count(*)::int from private.search_article_candidates(array['bodyalpha'])),2,'body matches only eligible published articles');
select is((select count(*)::int from private.search_article_candidates(array['writeralpha'])),1,'writer credits deduplicate multiple roles');
select is((select count(*)::int from private.search_article_candidates(array['editoronlyalpha'])),0,'editor-only names are outside writer/owner contract');
select is((select count(*)::int from private.search_article_candidates(array['owneralpha'])),2,'public owner name match');
select is((select count(*)::int from private.search_article_candidates(array['sectionalpha'])),2,'section name match');
select is((select count(*)::int from private.search_article_candidates(array['categoryalpha'])),1,'category name match');
select is((select count(*)::int from private.search_article_candidates(array['tagalpha'])),1,'tag name match');
select is((select count(*)::int from private.search_article_candidates(array['titlealpha','writeralpha','tagalpha'])),1,'all words may span text/writer/taxonomy sources');
select is((select count(*)::int from private.search_article_candidates(array['titlealpha','absentword'])),0,'every query word must match');
select is((select count(*)::int from private.search_article_candidates(array['titlealpha','titlealpha'])),1,'duplicate words do not duplicate results');
select is((select count(*)::int from private.search_article_candidates(private.search_lexemes('cross-field'))),1,'native compound lexemes remain valid candidate inputs');
select is((select count(*)::int from private.search_article_candidates(array['privatekeyphrasealpha'])),0,'private SEO keyphrase is not a search field');
select is((select count(*)::int from private.search_article_candidates(array['privatealpha'])),0,'draft not searchable');
select is((select count(*)::int from private.search_article_candidates(array['archivealpha'])),0,'archive not searchable');
select is((select count(*)::int from private.search_article_candidates(array['hiddenalpha'])),0,'inactive section not searchable');
select is((select count(*)::int from private.search_article_candidates(array['inactivealpha'])),0,'inactive owner not searchable');
create temp table search_source_proof(hash text);
insert into search_source_proof select md5(to_jsonb(a)::text) from public.articles a where slug='search-case-1';
update public.profiles set display_name='Writerbeta' where slug='search-writer';
update public.sections set name='Sectionbeta' where slug='search-alpha';
update public.categories set name='Categorybeta' where slug='search-category';
update public.tags set name='Tagbeta' where slug='search-tag';
update public.profiles set display_name='Ownerbeta' where slug='search-owner';
select is((select count(*)::int from private.search_article_candidates(array['writeralpha'])),0,'old writer name disappears');
select is((select count(*)::int from private.search_article_candidates(array['writerbeta','sectionbeta','categorybeta','tagbeta','ownerbeta'])),1,'all renamed labels resolve live without article fan-out');
select is((select md5(to_jsonb(a)::text) from public.articles a where slug='search-case-1'),(select hash from search_source_proof),'label renames do not mutate article fields/version/timestamps');
delete from public.article_tags where tag_id='4b000000-0000-0000-0000-000000000044';
select is((select count(*)::int from private.search_article_candidates(array['tagbeta'])),0,'tag removal is immediately visible');
update public.categories set active=false where slug='search-category';
select is((select count(*)::int from private.search_article_candidates(array['categorybeta'])),0,'inactive category excluded');
delete from public.article_contributors where profile_id='1b000000-0000-0000-0000-000000000002' and contribution_role='writer';
select is((select count(*)::int from private.search_article_candidates(array['writerbeta'])),0,'removing writer role leaves no stale credit match');
select is((select article_id from private.search_article_candidates(array['ownerbeta'],1)),'5b000000-0000-0000-0000-000000000002'::uuid,'newest-first bounded candidate');
select is((select article_id from private.search_article_candidates(array['ownerbeta'],1,'2026-11-10T00:00:00.000002Z','5b000000-0000-0000-0000-000000000002')),'5b000000-0000-0000-0000-000000000001'::uuid,'microsecond paired keyset continuation');
update public.articles set title='Editedalpha' where slug='search-case-1';
select is((select count(*)::int from private.search_article_candidates(array['titlealpha'])),0,'published edit removes old indexed title');
select is((select count(*)::int from private.search_article_candidates(array['editedalpha'])),1,'published edit adds new indexed title');
update public.articles set status='archived',archived_at=now() where slug='search-case-1';
select is((select count(*)::int from private.search_article_candidates(array['editedalpha'])),0,'archive removes current index match');
update public.articles set status='published',archived_at=null where slug='search-case-1';
select is((select count(*)::int from private.search_article_candidates(array['editedalpha'])),1,'restore rebuilds eligible match');
select throws_ok($$ select * from private.search_article_candidates(array[]::text[]) $$,'22023',null,'empty terms rejected');
select throws_ok($$ select * from private.search_article_candidates(array['Uppercase']) $$,'22023',null,'raw unnormalized terms rejected');
select throws_ok($$ select * from private.search_article_candidates(array_fill('word'::text,array[9])) $$,'22023',null,'too many terms rejected');
select throws_ok($$ select * from private.search_article_candidates(array['word'],26) $$,'22023',null,'excess result limit rejected');
select throws_ok($$ select * from private.search_article_candidates(array['word'],1,now(),null) $$,'22023',null,'unpaired cursor rejected');
select ok(not has_function_privilege('anon','private.search_article_candidates(text[],integer,timestamptz,uuid)','execute'),'no anonymous search endpoint yet');
select ok(not has_function_privilege('authenticated','private.search_article_candidates(text[],integer,timestamptz,uuid)','execute'),'authenticated cannot bypass future public quota');
select * from finish();
rollback;
