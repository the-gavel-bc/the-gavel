begin;
select no_plan();
create temp table audit_before as select count(*)::int n from public.audit_events
  where action in ('section.created','category.created','tag.renamed','tag.merged','tag.deleted',
    'section.deleted','category.deleted');
update auth.users set email='tax-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id='00000000-0000-0000-0000-000000000004';
update auth.users set email='tax-author@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id='00000000-0000-0000-0000-000000000002';
update auth.users set email='tax-editor@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id='00000000-0000-0000-0000-000000000003';
update public.memberships set role='editor', active=true
  where user_id='00000000-0000-0000-0000-000000000003';
insert into public.sections(id,name,slug,navigation_order,active) values
  ('a1000000-0000-0000-0000-000000000001','Tax one','tax-one',1,true),
  ('a1000000-0000-0000-0000-000000000002','Tax off','tax-off',2,false);
insert into public.tags(id,name,slug) values
  ('a2000000-0000-0000-0000-000000000001','Alpha','alpha'),
  ('a2000000-0000-0000-0000-000000000002','Beta','beta'),
  ('a2000000-0000-0000-0000-000000000003','Gamma','gamma'),
  ('a2000000-0000-0000-0000-000000000004','Unused','unused');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status)
  values('a3000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001','Tax story','tax-story','draft'),
  ('a3000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001','Tax story two','tax-story-two','draft');
update public.articles set status='published', published_at=now()
where id='a3000000-0000-0000-0000-000000000002';
insert into public.article_tags(article_id,tag_id) values
  ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002'),
  ('a3000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001');

select ok(not has_function_privilege('anon','public.create_taxonomy(text,uuid,text,integer,uuid)','EXECUTE'),
  'anonymous cannot create taxonomy');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000001','Nope',9,null)->>'code',
  'forbidden','author cannot create a section');
select is(public.rename_tag('a2000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002','X')->>'code',
  'forbidden','author cannot rename a tag');
select is(public.delete_unused_tag('a2000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000003')->>'code',
  'forbidden','author cannot delete a tag');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is(public.create_taxonomy('section',gen_random_uuid(),'Denied section',9,null)->>'code',
  'forbidden','editor cannot create a section');
select is(public.rename_tag('a2000000-0000-0000-0000-000000000004',gen_random_uuid(),'Denied tag')->>'code',
  'forbidden','editor cannot rename a tag');
select is(public.delete_taxonomy('section','a1000000-0000-0000-0000-000000000002',gen_random_uuid())->>'code',
  'forbidden','editor cannot delete an unused section');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000010',' Bad',1,null)->>'code',
  'invalid_input','names must be trimmed');
select is(public.create_taxonomy('category','b0000000-0000-0000-0000-000000000011','Cat',1,null)->>'code',
  'invalid_input','a category needs a section');
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000012','Cat',1,
  'a1000000-0000-0000-0000-000000000001')->>'code','invalid_input','a section has no parent');
select is((public.create_taxonomy('section','b0000000-0000-0000-0000-000000000013','New Section!',5,null))->>'slug',
  'new-section','section slug comes from the name');
select is((public.create_taxonomy('section','b0000000-0000-0000-0000-000000000013','New Section!',5,null))->>'replayed',
  'true','an exact retry replays and creates nothing new');
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000013','Other',5,null)->>'code',
  'request_conflict','a reused request id with other content conflicts');
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000014','NEW SECTION!',6,null)->>'code',
  'conflict','a duplicate name conflicts');
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000015','New-Section',6,null)->>'slug',
  'new-section-2','a slug collision gets a numeric suffix');
select is(public.create_taxonomy('category','b0000000-0000-0000-0000-000000000016','Fresh Category',1,
  'a1000000-0000-0000-0000-000000000001')->>'slug','fresh-category','category is created under its section');
select is(public.create_taxonomy('category','b0000000-0000-0000-0000-000000000017','Orphan',1,
  'a1000000-0000-0000-0000-000000000002')->>'code','conflict','no new category under an inactive section');
select is(public.create_taxonomy('category','b0000000-0000-0000-0000-000000000018','Orphan',1,
  'a1000000-0000-0000-0000-0000000000ff')->>'code','not_found','unknown section');

-- Tags
select is(public.rename_tag('a2000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000020','beta')->>'code',
  'conflict','a rename cannot take another tag''s name');
select is(public.rename_tag('a2000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000021','Gamma  Ray')->>'code',
  'invalid_input','extra spaces are rejected');
select is(public.rename_tag('a2000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000022','Gamma Ray')->>'changed',
  'true','tag renamed');
select is((select slug from public.tags where id='a2000000-0000-0000-0000-000000000003'),'gamma','the tag slug is stable');
select is(public.merge_tags('a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000023')->>'code',
  'invalid_input','a tag cannot merge into itself');
select is(public.merge_tags('a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000024')->>'ok',
  'true','tags merge');
select is(public.merge_tags('a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000024')->>'replayed',
  'true','an exact merge retry replays');
select is((select count(*)::int from public.article_tags where tag_id='a2000000-0000-0000-0000-000000000002'),2,
  'every story keeps the surviving tag exactly once');
select is((select count(*)::int from public.article_tags where
  article_id='a3000000-0000-0000-0000-000000000002' and tag_id='a2000000-0000-0000-0000-000000000002'),1,
  'a published story keeps the surviving tag once');
select is((select count(*)::int from public.tags where id='a2000000-0000-0000-0000-000000000001'),0,'merged tag is gone');
select is(public.delete_unused_tag('a2000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000025')->>'code',
  'conflict','a used tag cannot be deleted');
select is(public.delete_unused_tag('a2000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000026')->>'ok',
  'true','an unused tag is deleted');
select is(public.delete_unused_tag('a2000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000027')->>'code',
  'not_found','deleting again is not found');
select is((select referenced_live from public.list_admin_taxonomy('tag',51)
  where id='a2000000-0000-0000-0000-000000000002'),true,'admin list shows tags in use');
-- Delete (unused only)
select is(public.delete_taxonomy('section','a1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000030')->>'code',
  'conflict','a section a story uses cannot be deleted');
select is(public.delete_taxonomy('category',(select id from public.categories where slug='fresh-category'),'b0000000-0000-0000-0000-000000000031')->>'ok',
  'true','an unused category is deleted');
select is(public.delete_taxonomy('section',(select id from public.sections where slug='new-section'),'b0000000-0000-0000-0000-000000000032')->>'ok',
  'true','an unused section is deleted');
select is(public.delete_taxonomy('section','a1000000-0000-0000-0000-0000000000ee','b0000000-0000-0000-0000-000000000033')->>'code',
  'not_found','unknown section');
select is((select in_use from public.list_admin_taxonomy('section',51) where id='a1000000-0000-0000-0000-000000000001'),true,
  'the admin list marks an item a draft story uses');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.delete_taxonomy('section','a1000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000034')->>'code',
  'forbidden','author cannot delete taxonomy');
reset role;
select is((select count(*)::int from public.audit_events where action in
  ('section.created','category.created','tag.renamed','tag.merged','tag.deleted',
    'section.deleted','category.deleted')) - (select n from audit_before),8,
  'every change is audited once');
select results_eq(
  $$select correlation_id, action from public.audit_events
    where correlation_id in (
      'b0000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000015',
      'b0000000-0000-0000-0000-000000000016', 'b0000000-0000-0000-0000-000000000022',
      'b0000000-0000-0000-0000-000000000024', 'b0000000-0000-0000-0000-000000000026',
      'b0000000-0000-0000-0000-000000000031', 'b0000000-0000-0000-0000-000000000032')
    order by correlation_id$$,
  $$values ('b0000000-0000-0000-0000-000000000013'::uuid,'section.created'),
    ('b0000000-0000-0000-0000-000000000015'::uuid,'section.created'),
    ('b0000000-0000-0000-0000-000000000016'::uuid,'category.created'),
    ('b0000000-0000-0000-0000-000000000022'::uuid,'tag.renamed'),
    ('b0000000-0000-0000-0000-000000000024'::uuid,'tag.merged'),
    ('b0000000-0000-0000-0000-000000000026'::uuid,'tag.deleted'),
    ('b0000000-0000-0000-0000-000000000031'::uuid,'category.deleted'),
    ('b0000000-0000-0000-0000-000000000032'::uuid,'section.deleted')$$,
  'taxonomy writes record one expected action per committed request');
insert into public.sections(name,slug)
select 'Cap section '||n,'cap-section-'||n
from generate_series(1,100-(select count(*)::int from public.sections where active)) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.create_taxonomy('section',gen_random_uuid(),'Over the cap',5,null)->>'code',
  'conflict','administrator cannot create a 101st active section');
select is(public.update_section_taxonomy('a1000000-0000-0000-0000-000000000002',1,
  gen_random_uuid(),'Tax off',2,true)->>'code','conflict','reactivation observes the active section cap');
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000013',
  'New Section!',5,null)->>'replayed','true','the cap does not invalidate an authorized receipt');
reset role;
update public.memberships set role='author'
where user_id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.create_taxonomy('section','b0000000-0000-0000-0000-000000000013',
  'New Section!',5,null)->>'code','forbidden','demoted administrator cannot replay a section creation');
select is(public.merge_tags('a2000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000024')->>'code',
  'forbidden','demoted administrator cannot replay a tag merge');
reset role;
select * from finish();
rollback;
