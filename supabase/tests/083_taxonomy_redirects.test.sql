begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
\ir support/review-fixtures/review-fixtures.inc
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);

create temp table redirect_tags as
select p.kind,gen_random_uuid() id,'redirect-'||p.kind||'-'||pg_temp.review_fixture_token() slug
from (values('first'),('second'),('third')) p(kind);
insert into public.tags(id,name,slug) select id,slug,slug from redirect_tags;
grant select on redirect_tags to authenticated,anon;

create temp table redirect_article as
select (public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'articleId')::uuid id;
update public.articles set status='published',published_at=now() where id=(select id from redirect_article);
insert into public.article_tags(article_id,tag_id)
select a.id,t.id from redirect_article a cross join redirect_tags t where t.kind in ('first','second');

select has_function('public','resolve_taxonomy_redirect',array['text'],'anonymous redirect reader exists');
set local role authenticated;
select is(public.merge_tags((select id from redirect_tags where kind='first'),
  (select id from redirect_tags where kind='second'),'83000000-0000-0000-0000-000000000001')->>'ok','true',
  'merge into an already-linked tag succeeds');
select is(public.merge_tags((select id from redirect_tags where kind='first'),
  (select id from redirect_tags where kind='second'),'83000000-0000-0000-0000-000000000001')->>'replayed','true',
  'exact merge retry replays before looking up the retired tag');
reset role;
select is((select edit_version from public.articles where id=(select id from redirect_article)),2,
  'a published article changes version exactly once');
select ok(exists(select 1 from public.article_revisions r where r.article_id=(select id from redirect_article)
  and r.snapshot->'tagIds'=jsonb_build_array((select id from redirect_tags where kind='second'))),
  'the new revision contains the surviving tag once');
select is((select detail->>'targetId' from public.audit_events where correlation_id='83000000-0000-0000-0000-000000000001'),
  (select id::text from redirect_tags where kind='second'),'the audit detail names the surviving tag');

set local role authenticated;
select is(public.merge_tags((select id from redirect_tags where kind='second'),
  (select id from redirect_tags where kind='third'),gen_random_uuid())->>'ok','true','a second merge succeeds');
select isnt(public.ensure_tag((select slug from redirect_tags where kind='first'))->>'slug',
  (select slug from redirect_tags where kind='first'),'creation cannot reuse the retired URL');
reset role;
set local role anon;
select is(public.resolve_taxonomy_redirect('/tags/'||(select slug from redirect_tags where kind='first')),
  '/tags/'||(select slug from redirect_tags where kind='third'),'the original URL jumps directly to the final live tag');
select is(public.resolve_taxonomy_redirect('/tags/'||(select slug from redirect_tags where kind='third')),null,
  'current URLs have no redirect');
select is(public.resolve_taxonomy_redirect('//example.com'),null,'external URLs are outside the lookup');
reset role;

create temp table redirect_taxonomy as
select gen_random_uuid() section_id,gen_random_uuid() category_id,'redirect-section-'||pg_temp.review_fixture_token() slug;
insert into public.sections(id,name,slug) select section_id,slug,slug from redirect_taxonomy;
insert into public.categories(id,section_id,name,slug)
select category_id,section_id,'Redirect category '||pg_temp.review_fixture_token(),'sample-category' from redirect_taxonomy;
grant select on redirect_taxonomy to anon, authenticated;

update public.sections s set slug=t.slug||'-new' from redirect_taxonomy t where s.id=t.section_id;
set local role anon;
select is(public.resolve_taxonomy_redirect('/sections/'||(select slug from redirect_taxonomy)),
  '/sections/'||(select slug||'-new' from redirect_taxonomy),'a retired section path follows its row');
select is(public.resolve_taxonomy_redirect('/sections/'||(select slug from redirect_taxonomy)||'/categories/sample-category'),
  '/sections/'||(select slug||'-new' from redirect_taxonomy)||'/categories/sample-category',
  'a nested category URL also follows a renamed section');
reset role;
set local role authenticated;
select is(public.delete_taxonomy('category',(select category_id from redirect_taxonomy),gen_random_uuid())->>'ok','true',
  'unused category can be deleted under the existing policy');
reset role;
set local role anon;
select is(public.resolve_taxonomy_redirect('/sections/'||(select slug||'-new' from redirect_taxonomy)||'/categories/sample-category'),
  '/sections/'||(select slug||'-new' from redirect_taxonomy),'a deleted category redirects to its active section');
reset role;
create temp table private_tag as
select gen_random_uuid() id,'never-public-'||pg_temp.review_fixture_token() slug;
insert into public.tags(id,name,slug) select id,slug,slug from private_tag;
grant select on private_tag to anon,authenticated;
set local role authenticated;
select is(public.delete_unused_tag((select id from private_tag),gen_random_uuid())->>'ok','true',
  'an unused private tag can be deleted');
reset role;
set local role anon;
select is(public.resolve_taxonomy_redirect('/tags/'||(select slug from private_tag)),null,
  'deleting a never-public tag does not disclose its slug');
reset role;

select * from finish();
rollback;
