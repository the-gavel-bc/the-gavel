begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 values('9f000000-0000-0000-0000-000000000001','author-proof-member@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb,'{}');
insert into public.sections(id,name,slug,active) values
 ('2f000000-0000-0000-0000-000000000001','Author proof news','author-proof-news',true),
 ('2f000000-0000-0000-0000-000000000002','Author proof hidden','author-proof-hidden',false);
insert into public.profiles(id,auth_user_id,display_name,slug,biography) values
 ('1f000000-0000-0000-0000-000000000001','9f000000-0000-0000-0000-000000000001','Author proof guest','author-proof-guest','Public guest biography.'),
 ('1f000000-0000-0000-0000-000000000002',null,'Author proof empty','author-proof-empty',null),
 ('1f000000-0000-0000-0000-000000000003',null,'Author proof inactive','author-proof-inactive','Hidden biography.'),
 ('1f000000-0000-0000-0000-000000000004',null,'Author proof credit only','author-proof-credit-only','Not public.');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at)
select ('5f000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case when n in (1,3,7) then '10000000-0000-0000-0000-000000000002'::uuid else '10000000-0000-0000-0000-000000000003'::uuid end,
 case when n=7 then '2f000000-0000-0000-0000-000000000002'::uuid else '2f000000-0000-0000-0000-000000000001'::uuid end,
 'Author proof story '||n,'author-proof-story-'||n,
 case n when 4 then 'draft'::public.article_status when 5 then 'archived'::public.article_status else 'published'::public.article_status end,
 case when n!=4 then '2026-11-10T00:00:00Z'::timestamptz+n*interval '1 microsecond' else null end,
 case when n=5 then now() else null end from generate_series(1,8) n;
insert into public.article_contributors(article_id,profile_id,contribution_role) values
 ('5f000000-0000-0000-0000-000000000002','1f000000-0000-0000-0000-000000000001','writer'),
 ('5f000000-0000-0000-0000-000000000002','1f000000-0000-0000-0000-000000000001','editor'),
 ('5f000000-0000-0000-0000-000000000003','1f000000-0000-0000-0000-000000000001','writer'),
 ('5f000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','writer'),
 ('5f000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','editor'),
 ('5f000000-0000-0000-0000-000000000004','1f000000-0000-0000-0000-000000000001','writer'),
 ('5f000000-0000-0000-0000-000000000005','1f000000-0000-0000-0000-000000000001','writer'),
 ('5f000000-0000-0000-0000-000000000008','1f000000-0000-0000-0000-000000000003','writer');
-- A privileged fixture models legacy stale credits without disabling guards.
update public.profiles set active=false where id='1f000000-0000-0000-0000-000000000003';
update public.memberships set active=false,revoked_at=now() where user_id='00000000-0000-0000-0000-000000000002';
create temp table author_proof(value jsonb);
grant all on author_proof to anon,authenticated;
set local role anon;
select is((select biography from public.profiles where slug='author-proof-guest' and active),'Public guest biography.','a member profile with an account has a public biography');
select is((select count(*)::int from public.profiles where slug='author-proof-inactive'),0,'anonymous active-only RLS hides inactive biography');
select is((select count(*)::int from public.profiles where slug='author-proof-missing'),0,'unknown profile is equally absent');
select ok(not has_column_privilege('anon','public.profiles','auth_user_id','select'),'public readers cannot select identity linkage');
select throws_ok($$ select auth_user_id from public.profiles $$,'42501',null,'Auth linkage remains forbidden through direct API');
select is(jsonb_array_length(public.list_public_articles('author','author-proof-guest',null,24,null)->'items'),2,'guest credits expose only published active stories once across roles');
select is(jsonb_array_length(public.list_public_articles('author','author-proof-empty',null,24,null)->'items'),0,'active empty guest remains a valid empty archive');
select is(jsonb_array_length(public.list_public_articles('author','author-proof-inactive',null,24,null)->'items'),0,'inactive legacy credited profile is not a public filter');
select is(jsonb_array_length(public.list_public_articles('author','author-a',null,24,null)->'items'),2,'inactive membership retains published owner stories without duplicate self-credits');
select is((select count(*)::int from public.profiles where slug='author-a'),1,'inactive membership alone does not retract public biography');
insert into author_proof select public.list_public_articles('author','author-proof-guest',null,1,null);
select is(public.list_public_articles('author','author-proof-empty',null,1,(select value->'nextCursor' from author_proof))->>'kind','invalid','cursor cannot cross author identity');
select is(public.list_public_articles('tag','author-proof-guest',null,1,(select value->'nextCursor' from author_proof))->>'kind','invalid','author cursor cannot cross filter kind');
select is(public.list_public_articles('author','author-proof-guest',null,1,(select value->'nextCursor' from author_proof))#>>'{items,0,slug}','author-proof-story-2','final page contains the older guest credit');
reset role;
set local role authenticated;
select is(public.list_public_articles('author','author-proof-guest',null,1,null),(select value from author_proof),'authenticated and anonymous public author lists match');
reset role;
select ok((select slug_frozen from public.profiles where id='1f000000-0000-0000-0000-000000000001'),'published guest credit retains frozen author URL');
-- Credit-only people (no account) have no author page or archive.
set local role anon;
select is((select count(*)::int from public.profiles where slug='author-proof-credit-only'),0,'credit-only profile has no public page');
select is((select count(*)::int from public.profiles where slug='author-proof-empty'),0,'a profile without an account is not public');
select is(jsonb_array_length(public.list_public_articles('author','author-proof-credit-only',null,24,null)->'items'),0,'credit-only name is not an archive filter');
reset role;
insert into public.article_contributors(article_id,profile_id,contribution_role,display_order)
  values('5f000000-0000-0000-0000-000000000002','1f000000-0000-0000-0000-000000000004','writer',9);
select is((select w->'slug' from jsonb_array_elements(public.list_public_articles('author','author-proof-guest',null,24,null)->'items') i,
  jsonb_array_elements(i->'writers') w where w->>'displayName'='Author proof credit only'),'null'::jsonb,
  'a credit-only writer is shown by name with no author link');
select * from finish();
rollback;
