begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc

delete from public.homepage_selections;
update public.homepage_curation set edit_version=1;
update public.memberships set role='editor',active=true
where user_id='00000000-0000-0000-0000-000000000003';
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,updated_at)
select ('79000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '10000000-0000-0000-0000-000000000002',
  case when n=4 then '20000000-0000-0000-0000-000000000052'::uuid else '20000000-0000-0000-0000-000000000051'::uuid end,
  case n when 1 then 'Homepage probe 100% eligible' when 2 then 'Homepage probe 100 percent'
    when 3 then 'Homepage probe pending image' else 'Homepage probe inactive section' end,
  'homepage-probe-'||n,'published','2090-01-01'::timestamptz+n*interval '1 minute',now()+n*interval '1 second'
from generate_series(1,4) n;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key)
values('79000000-0000-0000-0000-000000000009','79000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',gen_random_uuid(),'homepage-probe/pending.webp');
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
values('79000000-0000-0000-0000-000000000003','79000000-0000-0000-0000-000000000009','Test','Test');

set local role anon;
select is(public.get_public_homepage()->>'kind','ok',
  'a top-ranked pending-image story does not make the homepage unavailable');
select ok(not jsonb_path_exists(public.get_public_homepage(),
  '$.**.slug ? (@ == "homepage-probe-3")'),
  'the pending-image story stays out of all public homepage groups');
reset role;

select ok(not has_function_privilege('anon',
  'public.list_homepage_eligible_stories(integer,text,timestamptz,uuid)','EXECUTE'),
  'anonymous role cannot execute the administrator library');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select throws_ok($$select * from public.list_homepage_eligible_stories(13)$$,'42501',null,
  'editors cannot read the administrator library');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select throws_ok($$select * from public.list_homepage_eligible_stories(14)$$,'22023',null,
  'oversized library pages are rejected');
select throws_ok($$select * from public.list_homepage_eligible_stories(13,null,now(),null)$$,'22023',null,
  'both cursor fields are required');

select results_eq(
  $$select id from public.list_homepage_eligible_stories(13,'homepage probe')$$,
  $$values ('79000000-0000-0000-0000-000000000002'::uuid),('79000000-0000-0000-0000-000000000001'::uuid)$$,
  'search returns only eligible stories in stable update order');
select results_eq(
  $$select id from public.list_homepage_eligible_stories(13,'100%')$$,
  $$values ('79000000-0000-0000-0000-000000000001'::uuid)$$,
  'percent is a literal search character');
select results_eq(
  $$select next.id from public.list_homepage_eligible_stories(1,'Homepage Probe') first
    cross join lateral public.list_homepage_eligible_stories(1,'Homepage Probe',first.updated_at,first.id) next$$,
  $$values ('79000000-0000-0000-0000-000000000001'::uuid)$$,
  'next page resumes after the last returned eligible row');

select is(public.save_homepage_selections(1,gen_random_uuid(),'79000000-0000-0000-0000-000000000003','{}','{}')->>'code',
  'invalid_input','a fresh save refuses a story with a pending main image');
select is(public.save_homepage_selections(1,gen_random_uuid(),'79000000-0000-0000-0000-000000000004','{}','{}')->>'code',
  'invalid_input','a fresh save refuses an inactive section');
select is(public.save_homepage_selections(1,'79000000-0000-0000-0000-000000000011',
  '79000000-0000-0000-0000-000000000001','{}','{}')->>'ok','true','an eligible pick saves');
reset role;

update public.articles set section_id='20000000-0000-0000-0000-000000000052'
  where id='79000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.save_homepage_selections(1,'79000000-0000-0000-0000-000000000011',
  '79000000-0000-0000-0000-000000000001','{}','{}')->>'replayed','true',
  'eligibility changes do not invalidate the exact stored receipt');
select is(public.get_admin_homepage_curation()#>>'{saved,lead,id}',
  '79000000-0000-0000-0000-000000000001','legacy unavailable picks remain visible for correction');
select is(public.get_admin_homepage_curation()#>>'{effective,lead,id}',
  '79000000-0000-0000-0000-000000000002','the public composition falls back to the next eligible story');
reset role;
select * from finish();
rollback;
