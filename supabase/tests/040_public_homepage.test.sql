begin;
select no_plan();
select has_function('public','get_public_homepage',array[]::text[],'public homepage composition exists');
select is((select provolatile::text from pg_proc where oid='public.get_public_homepage()'::regprocedure),'s','composition uses a single stable statement snapshot');
select ok(not has_function_privilege('anon','private.resolve_homepage_slots()','execute'),'anonymous cannot call private resolver');
select ok(not has_function_privilege('authenticated','private.homepage_card_map(uuid[])','execute'),'authenticated cannot call private card batch');
update public.articles set status='archived',archived_at=now() where status='published';
update public.sections set active=false;
delete from public.homepage_selections;
set local role anon;
select is(public.get_public_homepage()->>'kind','ok','empty catalog succeeds');
select is(public.get_public_homepage()->'lead','null'::jsonb,'empty lead is null');
select is(jsonb_array_length(public.get_public_homepage()->'featured'),0,'empty featured has no fabricated content');
select throws_ok($$ select * from public.homepage_selections $$,'42501',null,'private selections remain closed');
select throws_ok($$ select public.get_admin_homepage_curation() $$,'42501',null,'admin preview remains closed');
reset role;
insert into public.sections(id,name,slug) values('28000000-0000-0000-0000-000000000040','Home proof','home-proof');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
select ('58000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '10000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000040',
 'Home story '||n,'home-story-'||n,'published','2026-11-01T00:00:00.123456Z'
from generate_series(1,12) n;
insert into public.homepage_selections values
 ('lead',1,'58000000-0000-0000-0000-000000000001'),
 ('featured',1,'58000000-0000-0000-0000-000000000003'),
 ('featured',2,'58000000-0000-0000-0000-000000000002'),
 ('read_this',1,'58000000-0000-0000-0000-000000000012');
create temporary table home_proof(value jsonb);
grant select,insert on home_proof to anon,authenticated;
set local role anon;
insert into home_proof select public.get_public_homepage();
select is((select value#>>'{lead,slug}' from home_proof),'home-story-1','saved lead honored');
select is((select value#>>'{featured,0,slug}' from home_proof),'home-story-3','saved order honored');
select is((select value#>>'{featured,2,slug}' from home_proof),'home-story-11','fallback reserves saved read-this');
select is((select value#>>'{readThis,0,slug}' from home_proof),'home-story-12','saved read-this preserved');
select is((select value#>>'{latest,0,slug}' from home_proof),'home-story-12','latest uses timestamp and UUID ties');
select is((select value#>>'{sections,0,articles,0,slug}' from home_proof),'home-story-12','section rows reuse public card contract');
select ok((select value::text from home_proof) !~ 'edit_version|saved|object_key|auth_user_id|content','private fields and body excluded');
reset role;
update auth.users set email='home-admin@bc.edu',email_confirmed_at=now(),raw_app_meta_data='{"provider":"google"}' where id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.get_public_homepage(),(select value from home_proof),'authenticated public result matches anonymous');
select is(public.get_admin_homepage_curation()#>>'{effective,lead,id}',(select value#>>'{lead,id}' from home_proof),'admin effective lead matches public');
reset role;
update public.articles set status='archived',archived_at=now() where slug='home-story-1';
set local role anon;
select is(public.get_public_homepage()#>>'{lead,slug}','home-story-11','archived saved lead falls back without stealing reserved picks');
reset role;
update public.articles set status='published',archived_at=null where slug='home-story-1';
update public.articles set status='archived',archived_at=now() where section_id='28000000-0000-0000-0000-000000000040' and slug<>'home-story-1';
set local role anon;
select is(public.get_public_homepage()#>>'{lead,slug}','home-story-1','single story becomes the lead');
select is(jsonb_array_length(public.get_public_homepage()->'latest'),0,'single-story catalog has no duplicate latest');
select is(jsonb_array_length(public.get_public_homepage()->'featured'),0,'single-story catalog has no fabricated fallback');
reset role;
update public.articles set status='published',archived_at=null where section_id='28000000-0000-0000-0000-000000000040';
select throws_ok($$insert into public.homepage_selections values('read_this',2,'58000000-0000-0000-0000-000000000003')$$,'23505',null,'database rejects repeated picks across slots');
set local role anon;
select is(jsonb_array_length(public.get_public_homepage()->'readThis'),4,'read-this remains filled after rejected duplicate');
reset role;
update public.profiles set active=false where id='10000000-0000-0000-0000-000000000002';
set local role anon;
select is(public.get_public_homepage()->>'kind','unavailable','inactive required owner fails safely without private metadata');
reset role;
update public.profiles set active=true where id='10000000-0000-0000-0000-000000000002';
insert into public.sections(name,slug) select 'Home overflow '||n,'home-overflow-'||n from generate_series(1,99) n;
insert into public.articles(owner_profile_id,section_id,title,slug,status,published_at)
select '10000000-0000-0000-0000-000000000002',s.id,'Boundary story '||s.slug||'-'||n,'boundary-'||s.slug||'-'||n,'published',now()
from public.sections s cross join generate_series(1,4) n where s.slug like 'home-overflow-%';
set local role anon;
select is(public.get_public_homepage()->>'kind','ok','full 412-reference boundary succeeds');
select is(jsonb_array_length(public.get_public_homepage()->'sections'),100,'exactly 100 section groups supported');
reset role;
insert into public.sections(name,slug) values('Final overflow section','final-home-overflow');
set local role anon;
select is(public.get_public_homepage()->>'kind','unavailable','section overflow does not silently truncate');
reset role;
select * from finish();
rollback;
