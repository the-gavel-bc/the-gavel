begin;
select plan(90);

-- Privileged synthetic fixture changes are transaction-local.
update auth.users set email = 'gavel-credit-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');
insert into public.profiles (id, display_name, slug) values
  ('10000000-0000-0000-0000-000000000031', 'Synthetic Guest Contributor', 'synthetic-guest-contributor');
insert into public.sections (id, name, slug) values
  ('20000000-0000-0000-0000-000000000031', 'Synthetic Credits Section', 'synthetic-credits-section');
insert into public.categories (id, section_id, name, slug) values
  ('30000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031', 'Synthetic Credits Category', 'synthetic-credits-category');
insert into public.tags (id, name, slug) values
  ('40000000-0000-0000-0000-000000000031', 'Synthetic Credits Tag One', 'synthetic-credits-tag-one'),
  ('40000000-0000-0000-0000-000000000032', 'Synthetic Credits Tag Two', 'synthetic-credits-tag-two');
insert into public.articles (id, owner_profile_id, section_id, title, slug) values
  ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000031', 'Synthetic Credited A', 'synthetic-credited-a'),
  ('50000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000031', 'Synthetic Credited B', 'synthetic-credited-b'),
  ('50000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000031', 'Synthetic Credited Inactive', 'synthetic-credited-inactive'),
  ('50000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000031', 'Synthetic Tag Reference', 'synthetic-tag-reference'),
  ('50000000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000031', 'Synthetic Credit Reference', 'synthetic-credit-reference');
select lives_ok($$ insert into public.article_tags (article_id, tag_id) values
  ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000032'),
  ('50000000-0000-0000-0000-000000000032', '40000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000033', '40000000-0000-0000-0000-000000000032'),
  ('50000000-0000-0000-0000-000000000034', '40000000-0000-0000-0000-000000000031') $$,
  'tag links support multiple tags per article and multiple articles per tag');
select lives_ok($$ insert into public.article_contributors (article_id, profile_id, contribution_role) values
  ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'writer'),
  ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'editor'),
  ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031', 'creative'),
  ('50000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000031', 'writer'),
  ('50000000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000031', 'writer') $$,
  'credits allow different roles on the same profile/article and contributors without logins');
select lives_ok($$ insert into public.article_contributors values
  ('50000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000031', 'writer', 2) $$,
  'credit permits positive display order');
select is((select count(*) from public.article_contributors where article_id = '50000000-0000-0000-0000-000000000031' and display_order = 0),
  3::bigint, 'credit order defaults to zero and allows ties');
select ok((select p.auth_user_id is null from public.profiles p join public.article_contributors c on c.profile_id = p.id
  where c.article_id = '50000000-0000-0000-0000-000000000031' and c.contribution_role = 'creative'),
  'a credited contributor needs no Auth identity');
select is_empty($$ select 1 from public.article_contributors where article_id = '50000000-0000-0000-0000-000000000031'
  and profile_id = '10000000-0000-0000-0000-000000000002' $$, 'article owner has no credit in access fixture');
insert into public.article_categories values
  ('50000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000032', '30000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031'),
  ('50000000-0000-0000-0000-000000000033', '30000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031');

select throws_ok($$ insert into public.article_tags values
  ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000031') $$, '23505', null, 'duplicate tag association rejected');
select throws_ok($$ insert into public.article_contributors values
  ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'writer', 1) $$, '23505', null, 'same profile cannot repeat the same article role');
select throws_ok($$ update public.article_contributors set display_order = -1 $$, '23514', null, 'negative credit order rejected');
select throws_ok($$ update public.article_contributors set display_order = null $$, '23502', null, 'credit order cannot be NULL');
select throws_ok($$ update public.article_contributors set contribution_role = 'owner' $$, '22P02', null, 'unsupported contribution role rejected');
select throws_ok($$ insert into public.article_tags (article_id, tag_id) values (null, '40000000-0000-0000-0000-000000000031') $$, '23502', null, 'article_tags requires article_id');
select throws_ok($$ insert into public.article_tags (article_id, tag_id) values ('90000000-0000-0000-0000-000000000099', '40000000-0000-0000-0000-000000000031') $$, '23503', null, 'article_tags rejects nonexistent article_id');
select throws_ok($$ insert into public.article_tags (article_id, tag_id) values ('50000000-0000-0000-0000-000000000031', null) $$, '23502', null, 'article_tags requires tag_id');
select throws_ok($$ insert into public.article_tags (article_id, tag_id) values ('50000000-0000-0000-0000-000000000031', '90000000-0000-0000-0000-000000000099') $$, '23503', null, 'article_tags rejects nonexistent tag_id');
select throws_ok($$ insert into public.article_contributors (article_id, profile_id, contribution_role) values (null, '10000000-0000-0000-0000-000000000003', 'writer') $$, '23502', null, 'article_contributors requires article_id');
select throws_ok($$ insert into public.article_contributors (article_id, profile_id, contribution_role) values ('90000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000003', 'writer') $$, '23503', null, 'article_contributors rejects nonexistent article_id');
select throws_ok($$ insert into public.article_contributors (article_id, profile_id, contribution_role) values ('50000000-0000-0000-0000-000000000031', null, 'writer') $$, '23502', null, 'article_contributors requires profile_id');
select throws_ok($$ insert into public.article_contributors (article_id, profile_id, contribution_role) values ('50000000-0000-0000-0000-000000000031', '90000000-0000-0000-0000-000000000099', 'writer') $$, '23503', null, 'article_contributors rejects nonexistent profile_id');
select throws_ok($$ insert into public.article_contributors (article_id, profile_id, contribution_role) values ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', null) $$, '23502', null, 'article_contributors requires contribution_role');
select throws_ok($$ delete from public.articles where id = '50000000-0000-0000-0000-000000000034' $$, '23503', null, 'tag-linked article deletion is restricted');
select throws_ok($$ update public.articles set id = '90000000-0000-0000-0000-000000000099' where id = '50000000-0000-0000-0000-000000000034' $$, '23503', null, 'tag-linked article identity change is restricted');
select throws_ok($$ delete from public.articles where id = '50000000-0000-0000-0000-000000000035' $$, '23503', null, 'credit-linked article deletion is restricted');
select throws_ok($$ update public.articles set id = '90000000-0000-0000-0000-000000000099' where id = '50000000-0000-0000-0000-000000000035' $$, '23503', null, 'credit-linked article identity change is restricted');
select throws_ok($$ delete from public.tags where id = '40000000-0000-0000-0000-000000000031' $$, '23503', null, 'linked tag deletion is restricted');
select throws_ok($$ update public.tags set id = '90000000-0000-0000-0000-000000000099' where id = '40000000-0000-0000-0000-000000000031' $$, '23503', null, 'linked tag identity change is restricted');
select throws_ok($$ delete from public.profiles where id = '10000000-0000-0000-0000-000000000031' $$, '23503', null, 'credited profile deletion is restricted');
select throws_ok($$ update public.profiles set id = '90000000-0000-0000-0000-000000000099' where id = '10000000-0000-0000-0000-000000000031' $$, '23503', null, 'credited profile identity change is restricted');

-- Remove isolated reference-only fixtures before exact-ID access checks.
delete from public.article_tags where article_id = '50000000-0000-0000-0000-000000000034';
delete from public.article_contributors where article_id = '50000000-0000-0000-0000-000000000035';
delete from public.articles where id in ('50000000-0000-0000-0000-000000000034', '50000000-0000-0000-0000-000000000035');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.article_tags $$, '42501', null, 'anonymous cannot read article_tags');
select throws_ok($$ select * from public.article_contributors $$, '42501', null, 'anonymous cannot read article_contributors');
select throws_ok($$ insert into public.article_tags values ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000031') $$, '42501', null, 'anonymous: article_tags insert denied');
select throws_ok($$ update public.article_tags set tag_id = '40000000-0000-0000-0000-000000000031' $$, '42501', null, 'anonymous: article_tags update denied');
select throws_ok($$ delete from public.article_tags $$, '42501', null, 'anonymous: article_tags delete denied');
select throws_ok($$ insert into public.article_contributors values ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'writer', 0) $$, '42501', null, 'anonymous: article_contributors insert denied');
select throws_ok($$ update public.article_contributors set display_order = 1 $$, '42501', null, 'anonymous: article_contributors update denied');
select throws_ok($$ delete from public.article_contributors $$, '42501', null, 'anonymous: article_contributors delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is_empty($$ select id::text from public.articles where id::text like '50000000-%' order by id $$, 'inactive owner has no private articles');
select is_empty($$ select article_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id $$, 'inactive owner has no private category links');
select is_empty($$ select article_id::text || '/' || tag_id::text from public.article_tags where article_id::text like '50000000-%' order by article_id, tag_id $$, 'inactive owner has no private tag links');
select is_empty($$ select article_id::text || '/' || profile_id::text || '/' || contribution_role::text from public.article_contributors where article_id::text like '50000000-%' order by article_id, profile_id, contribution_role::text $$, 'inactive owner has no private credits');
select throws_ok($$ insert into public.article_tags values ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000031') $$, '42501', null, 'inactive owner: article_tags insert denied');
select throws_ok($$ update public.article_tags set tag_id = '40000000-0000-0000-0000-000000000031' $$, '42501', null, 'inactive owner: article_tags update denied');
select throws_ok($$ delete from public.article_tags $$, '42501', null, 'inactive owner: article_tags delete denied');
select throws_ok($$ insert into public.article_contributors values ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'writer', 0) $$, '42501', null, 'inactive owner: article_contributors insert denied');
select throws_ok($$ update public.article_contributors set display_order = 1 $$, '42501', null, 'inactive owner: article_contributors update denied');
select throws_ok($$ delete from public.article_contributors $$, '42501', null, 'inactive owner: article_contributors delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq($$ select id::text from public.articles where id::text like '50000000-%' order by id $$,
  array['50000000-0000-0000-0000-000000000031']::text[], 'Author A without credits: exact permitted articles');
select results_eq($$ select article_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id $$,
  array['50000000-0000-0000-0000-000000000031']::text[], 'Author A without credits: exact permitted category links');
select results_eq($$ select article_id::text || '/' || tag_id::text from public.article_tags where article_id::text like '50000000-%' order by article_id, tag_id $$,
  array['50000000-0000-0000-0000-000000000031/40000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000031/40000000-0000-0000-0000-000000000032']::text[], 'Author A without credits: exact permitted tag links');
select results_eq($$ select article_id::text || '/' || profile_id::text || '/' || contribution_role::text from public.article_contributors where article_id::text like '50000000-%' order by article_id, profile_id, contribution_role::text $$,
  array['50000000-0000-0000-0000-000000000031/10000000-0000-0000-0000-000000000003/editor', '50000000-0000-0000-0000-000000000031/10000000-0000-0000-0000-000000000003/writer', '50000000-0000-0000-0000-000000000031/10000000-0000-0000-0000-000000000031/creative']::text[], 'Author A without credits: exact permitted credits');
select throws_ok($$ insert into public.article_tags values ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000031') $$, '42501', null, 'Author A without credits: article_tags insert denied');
select throws_ok($$ update public.article_tags set tag_id = '40000000-0000-0000-0000-000000000031' $$, '42501', null, 'Author A without credits: article_tags update denied');
select throws_ok($$ delete from public.article_tags $$, '42501', null, 'Author A without credits: article_tags delete denied');
select throws_ok($$ insert into public.article_contributors values ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'writer', 0) $$, '42501', null, 'Author A without credits: article_contributors insert denied');
select throws_ok($$ update public.article_contributors set display_order = 1 $$, '42501', null, 'Author A without credits: article_contributors update denied');
select throws_ok($$ delete from public.article_contributors $$, '42501', null, 'Author A without credits: article_contributors delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select results_eq($$ select id::text from public.articles where id::text like '50000000-%' order by id $$,
  array['50000000-0000-0000-0000-000000000032']::text[], 'Author B credited on A: exact permitted articles');
select results_eq($$ select article_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id $$,
  array['50000000-0000-0000-0000-000000000032']::text[], 'Author B credited on A: exact permitted category links');
select results_eq($$ select article_id::text || '/' || tag_id::text from public.article_tags where article_id::text like '50000000-%' order by article_id, tag_id $$,
  array['50000000-0000-0000-0000-000000000032/40000000-0000-0000-0000-000000000031']::text[], 'Author B credited on A: exact permitted tag links');
select results_eq($$ select article_id::text || '/' || profile_id::text || '/' || contribution_role::text from public.article_contributors where article_id::text like '50000000-%' order by article_id, profile_id, contribution_role::text $$,
  array['50000000-0000-0000-0000-000000000032/10000000-0000-0000-0000-000000000031/writer']::text[], 'Author B credited on A: exact permitted credits');
select throws_ok($$ insert into public.article_tags values ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000031') $$, '42501', null, 'Author B credited on A: article_tags insert denied');
select throws_ok($$ update public.article_tags set tag_id = '40000000-0000-0000-0000-000000000031' $$, '42501', null, 'Author B credited on A: article_tags update denied');
select throws_ok($$ delete from public.article_tags $$, '42501', null, 'Author B credited on A: article_tags delete denied');
select throws_ok($$ insert into public.article_contributors values ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'writer', 0) $$, '42501', null, 'Author B credited on A: article_contributors insert denied');
select throws_ok($$ update public.article_contributors set display_order = 1 $$, '42501', null, 'Author B credited on A: article_contributors update denied');
select throws_ok($$ delete from public.article_contributors $$, '42501', null, 'Author B credited on A: article_contributors delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select id::text from public.articles where id::text like '50000000-%' order by id $$,
  array['50000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000032', '50000000-0000-0000-0000-000000000033']::text[], 'eligible active administrator: exact permitted articles');
select results_eq($$ select article_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id $$,
  array['50000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000032', '50000000-0000-0000-0000-000000000033']::text[], 'eligible active administrator: exact permitted category links');
select results_eq($$ select article_id::text || '/' || tag_id::text from public.article_tags where article_id::text like '50000000-%' order by article_id, tag_id $$,
  array['50000000-0000-0000-0000-000000000031/40000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000031/40000000-0000-0000-0000-000000000032', '50000000-0000-0000-0000-000000000032/40000000-0000-0000-0000-000000000031', '50000000-0000-0000-0000-000000000033/40000000-0000-0000-0000-000000000032']::text[], 'eligible active administrator: exact permitted tag links');
select results_eq($$ select article_id::text || '/' || profile_id::text || '/' || contribution_role::text from public.article_contributors where article_id::text like '50000000-%' order by article_id, profile_id, contribution_role::text $$,
  array['50000000-0000-0000-0000-000000000031/10000000-0000-0000-0000-000000000003/editor', '50000000-0000-0000-0000-000000000031/10000000-0000-0000-0000-000000000003/writer', '50000000-0000-0000-0000-000000000031/10000000-0000-0000-0000-000000000031/creative', '50000000-0000-0000-0000-000000000032/10000000-0000-0000-0000-000000000031/writer', '50000000-0000-0000-0000-000000000033/10000000-0000-0000-0000-000000000031/writer']::text[], 'eligible active administrator: exact permitted credits');
select throws_ok($$ insert into public.article_tags values ('50000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000031') $$, '42501', null, 'eligible active administrator: article_tags insert denied');
select throws_ok($$ update public.article_tags set tag_id = '40000000-0000-0000-0000-000000000031' $$, '42501', null, 'eligible active administrator: article_tags update denied');
select throws_ok($$ delete from public.article_tags $$, '42501', null, 'eligible active administrator: article_tags delete denied');
select throws_ok($$ insert into public.article_contributors values ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'writer', 0) $$, '42501', null, 'eligible active administrator: article_contributors insert denied');
select throws_ok($$ update public.article_contributors set display_order = 1 $$, '42501', null, 'eligible active administrator: article_contributors update denied');
select throws_ok($$ delete from public.article_contributors $$, '42501', null, 'eligible active administrator: article_contributors delete denied');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select * from public.article_tags $$, 'non-Google owner cannot read article_tags');
select is_empty($$ select * from public.article_contributors $$, 'non-Google owner cannot read article_contributors');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select * from public.article_tags $$, 'unconfirmed owner cannot read article_tags');
select is_empty($$ select * from public.article_contributors $$, 'unconfirmed owner cannot read article_contributors');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'gavel-credit-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select * from public.article_tags $$, 'out-of-domain owner cannot read article_tags');
select is_empty($$ select * from public.article_contributors $$, 'out-of-domain owner cannot read article_contributors');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select * from public.article_tags $$, 'non-Google administrator cannot read article_tags');
select is_empty($$ select * from public.article_contributors $$, 'non-Google administrator cannot read article_contributors');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select * from public.article_tags $$, 'unconfirmed administrator cannot read article_tags');
select is_empty($$ select * from public.article_contributors $$, 'unconfirmed administrator cannot read article_contributors');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'gavel-credit-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select * from public.article_tags $$, 'out-of-domain administrator cannot read article_tags');
select is_empty($$ select * from public.article_contributors $$, 'out-of-domain administrator cannot read article_contributors');

set local role postgres;
update auth.users set email = 'gavel-credit-4@bc.edu' where id = '00000000-0000-0000-0000-000000000004';
update public.memberships set active = false where user_id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is_empty($$ select * from public.article_tags $$, 'deactivated administrator loses tag-link reads');
select is_empty($$ select * from public.article_contributors $$, 'deactivated administrator loses credit reads');

select * from finish();
rollback;
