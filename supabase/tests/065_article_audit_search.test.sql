begin;
select no_plan();
update auth.users set email='audit-search-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id='00000000-0000-0000-0000-000000000004';
update public.profiles set display_name='Zelda Searchable' where auth_user_id='00000000-0000-0000-0000-000000000004';
insert into public.sections(id,name,slug) values('a5000000-0000-0000-0000-000000000001','Audit search','audit-search');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status)
  values('a5000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004',
    'a5000000-0000-0000-0000-000000000001','Quokka budget vote','quokka-budget','draft');
insert into public.audit_events(id,actor_user_id,action,resource_type,resource_id,created_at) values
 ('a5000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','article.created','article',
  'a5000000-0000-0000-0000-000000000002','2031-03-09T15:00:00Z');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
create or replace function pg_temp.hits(q text) returns int language sql as
 $$ select count(*)::int from public.list_article_audit_events(51,null,null,null,q)
    where event_id='a5000000-0000-0000-0000-000000000003' $$;
select is(pg_temp.hits('quokka'),1,'matches the article title, case-insensitively');
select is(pg_temp.hits('zelda search'),1,'matches the actor name');
select is(pg_temp.hits('2031-03-09'),1,'matches an ISO date');
select is(pg_temp.hits('March 9, 2031'),1,'matches a long date');
select is(pg_temp.hits('Mar 9 2031'),1,'matches a short date');
select is(pg_temp.hits('3/9/2031'),1,'matches a numeric date');
select is(pg_temp.hits('nothing like this'),0,'no match returns nothing');
select is(pg_temp.hits('100%'),0,'wildcards are literal');
select is(pg_temp.hits('   '),1,'a blank search is no filter');
select throws_ok($$select * from public.list_article_audit_events(20,null,null,null,repeat('x',81))$$,
  '22023',null,'overlong search is rejected');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select throws_ok($$select * from public.list_article_audit_events(20,null,null,null,'x')$$,
  '42501',null,'authors cannot search activity');
reset role;
select * from finish();
rollback;
