begin;
select no_plan();

insert into public.tags(id, name, slug) values
  ('a2000000-0000-0000-0000-000000000073','Private catalog fixture','private-catalog-fixture'),
  ('a2000000-0000-0000-0000-000000000074','Public catalog fixture','public-catalog-fixture');
insert into public.profiles(id,display_name,slug,biography)
values ('a2000000-0000-0000-0000-000000000075','Credit fixture',
  'credit-only-catalog-fixture','Synthetic private credit biography');

insert into public.sections(id,name,slug)
values ('a2000000-0000-0000-0000-000000000077','Visibility fixture','visibility-fixture');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
select 'a2000000-0000-0000-0000-000000000078',p.id,
  'a2000000-0000-0000-0000-000000000077','Public tag fixture','public-tag-fixture',
  'published',now()
from public.profiles p where p.auth_user_id='00000000-0000-0000-0000-000000000002';
insert into public.articles(id,owner_profile_id,section_id,title,slug)
select 'a2000000-0000-0000-0000-000000000079',p.id,
  'a2000000-0000-0000-0000-000000000077','Private tag fixture','private-tag-fixture'
from public.profiles p where p.auth_user_id='00000000-0000-0000-0000-000000000002';
insert into public.article_tags(article_id,tag_id) values
  ('a2000000-0000-0000-0000-000000000078','a2000000-0000-0000-0000-000000000074'),
  ('a2000000-0000-0000-0000-000000000079','a2000000-0000-0000-0000-000000000073');

set local role anon;
select is((select count(*) from public.tags where slug='public-catalog-fixture'),
  1::bigint,'anonymous can see a tag attached to a published article');
select is((select count(*) from public.tags where slug='private-catalog-fixture'),
  0::bigint,'anonymous cannot see a tag without a public article');
select ok(not has_column_privilege('anon','public.profiles','id','SELECT'),
  'anonymous cannot read internal profile IDs');
select ok(not has_column_privilege('anon','public.profiles','created_at','SELECT'),
  'anonymous cannot read internal profile creation timestamps');
reset role;

select set_config('request.jwt.claim.sub','a2000000-0000-0000-0000-000000000076',true);
set local role authenticated;
select is((select count(*) from public.tags where slug='private-catalog-fixture'),
  0::bigint,'signed-in visitor without membership gets the public tag view');
select is((select count(*) from public.profiles where slug='credit-only-catalog-fixture'),
  0::bigint,'signed-in visitor without membership cannot see a credit-only profile');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.profiles where slug='credit-only-catalog-fixture'),
  0::bigint,'inactive members do not get the editor profile catalog');
reset role;

update auth.users set email='catalog-fixture@bc.edu', email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'
where id='00000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.tags where slug='private-catalog-fixture'),
  1::bigint,'eligible members can read tags in the editor catalog');
select is((select count(*) from public.profiles where slug='credit-only-catalog-fixture'),
  1::bigint,'eligible members can still resolve saved bylines');
reset role;

update public.articles set status='archived', archived_at=now()
where id='a2000000-0000-0000-0000-000000000078';
set local role anon;
select is((select count(*) from public.tags where slug='public-catalog-fixture'),
  0::bigint,'archiving the last public story hides the tag');
reset role;

select * from finish();
rollback;
