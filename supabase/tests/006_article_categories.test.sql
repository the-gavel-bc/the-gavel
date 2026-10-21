begin;
select plan(59);

-- All fixtures and privileged subtransactions remain inside this rollback.
update auth.users set email = 'gavel-category-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');
-- Untrusted credit/owner-looking claims do not confer article authority.
update auth.users set raw_user_meta_data = '{"credited_article_id":"50000000-0000-0000-0000-000000000021","owner_profile_id":"10000000-0000-0000-0000-000000000002"}'::jsonb
where id = '00000000-0000-0000-0000-000000000003';
insert into public.sections (id, name, slug) values
  ('20000000-0000-0000-0000-000000000021', 'Synthetic Category Alpha', 'synthetic-category-alpha'),
  ('20000000-0000-0000-0000-000000000022', 'Synthetic Category Beta', 'synthetic-category-beta');
insert into public.categories (id, section_id, name, slug) values
  ('30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', 'Synthetic Alpha One', 'synthetic-alpha-one'),
  ('30000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000022', 'Synthetic Beta One', 'synthetic-beta-one'),
  ('30000000-0000-0000-0000-000000000023', '20000000-0000-0000-0000-000000000021', 'Synthetic Alpha Two', 'synthetic-alpha-two');
insert into public.articles (id, owner_profile_id, section_id, title, slug) values
  ('50000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000021', 'Synthetic Linked A', 'synthetic-linked-a'),
  ('50000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000022', 'Synthetic Linked B', 'synthetic-linked-b'),
  ('50000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000021', 'Synthetic Linked Inactive', 'synthetic-linked-inactive');
select lives_ok($$ insert into public.article_categories (article_id, category_id, section_id) values
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021'),
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000023', '20000000-0000-0000-0000-000000000021'),
  ('50000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000022'),
  ('50000000-0000-0000-0000-000000000023', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$,
  'privileged same-section links support multiple categories and multiple articles');

select throws_ok($$ insert into public.article_categories values
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$,
  '23505', null, 'duplicate article/category pair rejected');
select throws_ok($$ insert into public.article_categories values
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000021') $$,
  '23503', null, 'category must match the supplied section');
select throws_ok($$ insert into public.article_categories values
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000022') $$,
  '23503', null, 'article must match the supplied section');
select throws_ok($$ insert into public.article_categories values (null, '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$, '23502', null, 'link requires article_id');
select throws_ok($$ insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', null, '20000000-0000-0000-0000-000000000021') $$, '23502', null, 'link requires category_id');
select throws_ok($$ insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', null) $$, '23502', null, 'link requires section_id');
select throws_ok($$ update public.article_categories set article_id = '90000000-0000-0000-0000-000000000099' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'link rejects nonexistent article_id');
select throws_ok($$ update public.article_categories set category_id = '90000000-0000-0000-0000-000000000099' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'link rejects nonexistent category_id');
select throws_ok($$ update public.article_categories set section_id = '90000000-0000-0000-0000-000000000099' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'link rejects nonexistent section_id');
select throws_ok($$ update public.article_categories set article_id = '50000000-0000-0000-0000-000000000022'
  where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'changing link article_id cannot bypass same-section integrity');
select throws_ok($$ update public.article_categories set category_id = '30000000-0000-0000-0000-000000000022'
  where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'changing link category_id cannot bypass same-section integrity');
select throws_ok($$ update public.article_categories set section_id = '20000000-0000-0000-0000-000000000022'
  where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'changing link section_id cannot bypass same-section integrity');
select throws_ok($$ update public.articles set section_id = '20000000-0000-0000-0000-000000000022' where id = '50000000-0000-0000-0000-000000000021' $$, '23503', null, 'linked articles section change is restricted');
select throws_ok($$ update public.articles set id = '90000000-0000-0000-0000-000000000099' where id = '50000000-0000-0000-0000-000000000021' $$, '23503', null, 'linked articles identity change is restricted');
select throws_ok($$ delete from public.articles where id = '50000000-0000-0000-0000-000000000021' $$, '23503', null, 'linked articles deletion change is restricted');
select throws_ok($$ update public.categories set section_id = '20000000-0000-0000-0000-000000000022' where id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'linked categories section change is restricted');
select throws_ok($$ update public.categories set id = '90000000-0000-0000-0000-000000000099' where id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'linked categories identity change is restricted');
select throws_ok($$ delete from public.categories where id = '30000000-0000-0000-0000-000000000021' $$, '23503', null, 'linked categories deletion change is restricted');

-- pgTAP executes each DO in an exception subtransaction. A failed final insert
-- must roll back both the preceding link removal and parent section update.
select throws_ok($sql$ do $block$ begin
  delete from public.article_categories where article_id = '50000000-0000-0000-0000-000000000021';
  update public.articles set section_id = '20000000-0000-0000-0000-000000000022' where id = '50000000-0000-0000-0000-000000000021';
  insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000022');
end $block$ $sql$, '23503', null, 'failed article move rolls back the entire privileged operation');
select is((select section_id::text from public.articles where id = '50000000-0000-0000-0000-000000000021'),
  '20000000-0000-0000-0000-000000000021', 'failed move preserves article section');
select is((select count(*) from public.article_categories where article_id = '50000000-0000-0000-0000-000000000021'),
  2::bigint, 'failed move restores both original article links');

select throws_ok($sql$ do $block$ begin
  delete from public.article_categories where category_id = '30000000-0000-0000-0000-000000000021';
  update public.categories set section_id = '20000000-0000-0000-0000-000000000022' where id = '30000000-0000-0000-0000-000000000021';
  insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021');
end $block$ $sql$, '23503', null, 'failed category move rolls back the entire privileged operation');
select is((select section_id::text from public.categories where id = '30000000-0000-0000-0000-000000000021'),
  '20000000-0000-0000-0000-000000000021', 'failed move preserves category section');
select is((select count(*) from public.article_categories where category_id = '30000000-0000-0000-0000-000000000021'),
  2::bigint, 'failed move restores links from both articles');

select lives_ok($sql$ do $block$ begin
  delete from public.article_categories where article_id = '50000000-0000-0000-0000-000000000021';
  update public.articles set section_id = '20000000-0000-0000-0000-000000000022' where id = '50000000-0000-0000-0000-000000000021';
  insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000022');
end $block$ $sql$, 'privileged atomic article move can replace links with matching categories');
select is((select section_id::text from public.articles where id = '50000000-0000-0000-0000-000000000021'),
  '20000000-0000-0000-0000-000000000022', 'successful article move changes section');
select results_eq($$ select category_id::text from public.article_categories where article_id = '50000000-0000-0000-0000-000000000021' $$,
  array['30000000-0000-0000-0000-000000000022']::text[], 'successful article move attaches only the matching category');

-- Restore the baseline article links before testing the opposite parent move.
delete from public.article_categories where article_id = '50000000-0000-0000-0000-000000000021';
update public.articles set section_id = '20000000-0000-0000-0000-000000000021' where id = '50000000-0000-0000-0000-000000000021';
insert into public.article_categories values
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021'),
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000023', '20000000-0000-0000-0000-000000000021');
select lives_ok($sql$ do $block$ begin
  delete from public.article_categories where category_id = '30000000-0000-0000-0000-000000000021';
  update public.categories set section_id = '20000000-0000-0000-0000-000000000022' where id = '30000000-0000-0000-0000-000000000021';
  insert into public.article_categories values ('50000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000022');
end $block$ $sql$, 'privileged atomic category move can reattach only to a matching article');
select is((select section_id::text from public.categories where id = '30000000-0000-0000-0000-000000000021'),
  '20000000-0000-0000-0000-000000000022', 'successful category move changes section');
select results_eq($$ select article_id::text from public.article_categories where category_id = '30000000-0000-0000-0000-000000000021' $$,
  array['50000000-0000-0000-0000-000000000022']::text[], 'successful category move attaches only to the matching article');

-- Restore stable fixtures for exact-ID permission tests.
delete from public.article_categories where category_id = '30000000-0000-0000-0000-000000000021';
update public.categories set section_id = '20000000-0000-0000-0000-000000000021' where id = '30000000-0000-0000-0000-000000000021';
insert into public.article_categories values
  ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021'),
  ('50000000-0000-0000-0000-000000000023', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021');
select is_empty($$ select 1 from public.article_categories ac
  join public.articles a on a.id = ac.article_id join public.categories c on c.id = ac.category_id
  where ac.section_id <> a.section_id or ac.section_id <> c.section_id $$,
  'all successful and rolled-back changes leave every association section-consistent');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.article_categories $$, '42501', null, 'anonymous cannot read private article associations');
select throws_ok($$ insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$, '42501', null, 'anonymous: association insert denied');
select throws_ok($$ update public.article_categories set section_id = '20000000-0000-0000-0000-000000000021' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '42501', null, 'anonymous: association update denied');
select throws_ok($$ delete from public.article_categories $$, '42501', null, 'anonymous: association delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is_empty($$ select article_id::text || '/' || category_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id, category_id $$, 'inactive owner cannot read associations');
select throws_ok($$ insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$, '42501', null, 'inactive owner: association insert denied');
select throws_ok($$ update public.article_categories set section_id = '20000000-0000-0000-0000-000000000021' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '42501', null, 'inactive owner: association update denied');
select throws_ok($$ delete from public.article_categories $$, '42501', null, 'inactive owner: association delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq($$ select article_id::text || '/' || category_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id, category_id $$,
  array['50000000-0000-0000-0000-000000000021/30000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000021/30000000-0000-0000-0000-000000000023']::text[], 'Author A sees exactly the associations allowed by article ownership');
select throws_ok($$ insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$, '42501', null, 'Author A: association insert denied');
select throws_ok($$ update public.article_categories set section_id = '20000000-0000-0000-0000-000000000021' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '42501', null, 'Author A: association update denied');
select throws_ok($$ delete from public.article_categories $$, '42501', null, 'Author A: association delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select results_eq($$ select article_id::text || '/' || category_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id, category_id $$,
  array['50000000-0000-0000-0000-000000000022/30000000-0000-0000-0000-000000000022']::text[], 'Author B with untrusted credit claims sees exactly the associations allowed by article ownership');
select throws_ok($$ insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$, '42501', null, 'Author B with untrusted credit claims: association insert denied');
select throws_ok($$ update public.article_categories set section_id = '20000000-0000-0000-0000-000000000021' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '42501', null, 'Author B with untrusted credit claims: association update denied');
select throws_ok($$ delete from public.article_categories $$, '42501', null, 'Author B with untrusted credit claims: association delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select article_id::text || '/' || category_id::text from public.article_categories where article_id::text like '50000000-%' order by article_id, category_id $$,
  array['50000000-0000-0000-0000-000000000021/30000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000021/30000000-0000-0000-0000-000000000023', '50000000-0000-0000-0000-000000000022/30000000-0000-0000-0000-000000000022', '50000000-0000-0000-0000-000000000023/30000000-0000-0000-0000-000000000021']::text[], 'eligible active administrator sees exactly the associations allowed by article ownership');
select throws_ok($$ insert into public.article_categories values ('50000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021') $$, '42501', null, 'eligible active administrator: association insert denied');
select throws_ok($$ update public.article_categories set section_id = '20000000-0000-0000-0000-000000000021' where article_id = '50000000-0000-0000-0000-000000000021' and category_id = '30000000-0000-0000-0000-000000000021' $$, '42501', null, 'eligible active administrator: association update denied');
select throws_ok($$ delete from public.article_categories $$, '42501', null, 'eligible active administrator: association delete denied');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select * from public.article_categories $$, 'non-Google owner cannot read associations');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select * from public.article_categories $$, 'unconfirmed owner cannot read associations');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'gavel-category-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select * from public.article_categories $$, 'out-of-domain owner cannot read associations');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select * from public.article_categories $$, 'non-Google administrator cannot read associations');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select * from public.article_categories $$, 'unconfirmed administrator cannot read associations');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'gavel-category-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select * from public.article_categories $$, 'out-of-domain administrator cannot read associations');

set local role postgres;
update auth.users set email = 'gavel-category-4@bc.edu' where id = '00000000-0000-0000-0000-000000000004';
update public.memberships set active = false where user_id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is_empty($$ select * from public.article_categories $$, 'deactivated administrator loses association reads');

select * from finish();
rollback;
