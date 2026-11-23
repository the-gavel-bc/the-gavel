begin;
select plan(163);

-- Privileged synthetic fixtures; all data and Auth changes roll back.
update auth.users set email = 'gavel-taxonomy-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');

insert into public.sections (id, name, slug, active) values
  ('20000000-0000-0000-0000-000000000001', 'Synthetic Alpha', 'synthetic-alpha', true),
  ('20000000-0000-0000-0000-000000000002', 'Synthetic Beta', 'synthetic-beta', true),
  ('20000000-0000-0000-0000-000000000003', 'Synthetic Hidden', 'synthetic-hidden', false);
insert into public.categories (id, section_id, name, slug, active) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Synthetic Topic', 'synthetic-topic', true),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Synthetic Inactive', 'synthetic-inactive', false),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Synthetic Hidden Parent', 'synthetic-hidden-parent', true),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'Synthetic Both Hidden', 'synthetic-both-hidden', false);
select lives_ok($$ insert into public.categories (id, section_id, name, slug)
  values ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Synthetic Topic', 'synthetic-topic') $$,
  'category names and slugs may repeat in different sections');
insert into public.tags (id, name, slug) values
  ('40000000-0000-0000-0000-000000000001', 'Synthetic Tag One', 'synthetic-tag-one'),
  ('40000000-0000-0000-0000-000000000002', 'Synthetic Tag Two', 'synthetic-tag-two');

-- sections: exact character bounds and canonical input, independently of UI.
select lives_ok($$ insert into public.sections (name, slug) values (repeat('x', 120), repeat('x', 120)) $$,
  'sections accepts 120-character names and slugs');
select ok((select id is not null and created_at = now() and updated_at = now() and active and navigation_order = 0
  from public.sections where slug = repeat('x', 120)), 'sections supplies required identity, timestamp and catalog defaults');
select lives_ok($$ insert into public.sections (name, slug) values ('Z', 'z') $$,
  'sections accepts one-character names and slugs');
select throws_ok(format('insert into public.sections (name, slug) values (%L, %L)', bad.name, bad.slug), '23514', null,
  'sections rejects ' || bad.reason)
from (values
  ('', 'valid-new', 'empty name'), (' ', 'valid-new', 'space-only name'),
  (E'\t\n', 'valid-new', 'tab/newline-only name'),
  (' leading', 'valid-new', 'leading name space'), ('trailing ', 'valid-new', 'trailing name space'),
  (E'\tleading', 'valid-new', 'leading name tab'), (E'trailing\n', 'valid-new', 'trailing name newline'),
  (repeat('x', 121), 'valid-new', '121-character name'),
  ('Valid New', '', 'empty slug'), ('Valid New', ' ', 'blank slug'),
  ('Valid New', ' valid-new', 'leading slug space'), ('Valid New', 'valid-new ', 'trailing slug space'),
  ('Valid New', 'Uppercase', 'uppercase slug'), ('Valid New', 'two--hyphens', 'double hyphen'),
  ('Valid New', '-leading', 'leading hyphen'), ('Valid New', 'trailing-', 'trailing hyphen'),
  ('Valid New', 'under_score', 'punctuation in slug'), ('Valid New', 'café', 'non-ASCII slug'),
  ('Valid New', repeat('x', 121), '121-character slug')
) as bad(name, slug, reason);
select throws_ok(format('insert into public.sections (name, slug) values (%L, %L)', null, 'valid-new'), '23502', null, 'sections requires a name');
select throws_ok(format('insert into public.sections (name, slug) values (%L, %L)', 'Valid New', null), '23502', null, 'sections requires a slug');
select throws_ok(format('insert into public.sections (name, slug) values (%L, %L)', 'synthetic alpha', 'new-unique-slug'), '23505', null,
  'sections rejects case-insensitive duplicate names in its scope');
select throws_ok(format('insert into public.sections (name, slug) values (%L, %L)', 'Unique New Name', 'synthetic-alpha'), '23505', null,
  'sections rejects duplicate slugs in its scope');
select lives_ok($$ update public.sections set updated_at = '2000-01-01' where slug = repeat('x', 120) $$,
  'sections accepts a privileged fixture update');
select is((select updated_at from public.sections where slug = repeat('x', 120)), now(),
  'sections refreshes updated_at instead of accepting a stale timestamp');
select throws_ok($$ insert into public.sections (name, slug, navigation_order)
  values ('Negative Order', 'negative-order', -1) $$, '23514', null, 'sections rejects negative navigation order');
delete from public.sections where slug in ('z', repeat('x', 120));

-- categories: exact character bounds and canonical input, independently of UI.
select lives_ok($$ insert into public.categories (name, slug, section_id) values (repeat('x', 120), repeat('x', 120), '20000000-0000-0000-0000-000000000001') $$,
  'categories accepts 120-character names and slugs');
select ok((select id is not null and created_at = now() and updated_at = now() and active and navigation_order = 0
  from public.categories where slug = repeat('x', 120)), 'categories supplies required identity, timestamp and catalog defaults');
select lives_ok($$ insert into public.categories (name, slug, section_id) values ('Z', 'z', '20000000-0000-0000-0000-000000000001') $$,
  'categories accepts one-character names and slugs');
select throws_ok(format($sql$insert into public.categories (name, slug, section_id) values (%L, %L, '20000000-0000-0000-0000-000000000001')$sql$, bad.name, bad.slug), '23514', null,
  'categories rejects ' || bad.reason)
from (values
  ('', 'valid-new', 'empty name'), (' ', 'valid-new', 'space-only name'),
  (E'\t\n', 'valid-new', 'tab/newline-only name'),
  (' leading', 'valid-new', 'leading name space'), ('trailing ', 'valid-new', 'trailing name space'),
  (E'\tleading', 'valid-new', 'leading name tab'), (E'trailing\n', 'valid-new', 'trailing name newline'),
  (repeat('x', 121), 'valid-new', '121-character name'),
  ('Valid New', '', 'empty slug'), ('Valid New', ' ', 'blank slug'),
  ('Valid New', ' valid-new', 'leading slug space'), ('Valid New', 'valid-new ', 'trailing slug space'),
  ('Valid New', 'Uppercase', 'uppercase slug'), ('Valid New', 'two--hyphens', 'double hyphen'),
  ('Valid New', '-leading', 'leading hyphen'), ('Valid New', 'trailing-', 'trailing hyphen'),
  ('Valid New', 'under_score', 'punctuation in slug'), ('Valid New', 'café', 'non-ASCII slug'),
  ('Valid New', repeat('x', 121), '121-character slug')
) as bad(name, slug, reason);
select throws_ok(format($sql$insert into public.categories (name, slug, section_id) values (%L, %L, '20000000-0000-0000-0000-000000000001')$sql$, null, 'valid-new'), '23502', null, 'categories requires a name');
select throws_ok(format($sql$insert into public.categories (name, slug, section_id) values (%L, %L, '20000000-0000-0000-0000-000000000001')$sql$, 'Valid New', null), '23502', null, 'categories requires a slug');
select throws_ok(format($sql$insert into public.categories (name, slug, section_id) values (%L, %L, '20000000-0000-0000-0000-000000000001')$sql$, 'synthetic topic', 'new-unique-slug'), '23505', null,
  'categories rejects case-insensitive duplicate names in its scope');
select throws_ok(format($sql$insert into public.categories (name, slug, section_id) values (%L, %L, '20000000-0000-0000-0000-000000000001')$sql$, 'Unique New Name', 'synthetic-topic'), '23505', null,
  'categories rejects duplicate slugs in its scope');
select lives_ok($$ update public.categories set updated_at = '2000-01-01' where slug = repeat('x', 120) $$,
  'categories accepts a privileged fixture update');
select is((select updated_at from public.categories where slug = repeat('x', 120)), now(),
  'categories refreshes updated_at instead of accepting a stale timestamp');
select throws_ok($$ insert into public.categories (name, slug, navigation_order, section_id)
  values ('Negative Order', 'negative-order', -1, '20000000-0000-0000-0000-000000000001') $$, '23514', null, 'categories rejects negative navigation order');
delete from public.categories where slug in ('z', repeat('x', 120));

-- tags: exact character bounds and canonical input, independently of UI.
select lives_ok($$ insert into public.tags (name, slug) values (repeat('x', 120), repeat('x', 120)) $$,
  'tags accepts 120-character names and slugs');
select ok((select id is not null and created_at = now() and updated_at = now()
  from public.tags where slug = repeat('x', 120)), 'tags supplies required identity, timestamp and catalog defaults');
select lives_ok($$ insert into public.tags (name, slug) values ('Z', 'z') $$,
  'tags accepts one-character names and slugs');
select throws_ok(format('insert into public.tags (name, slug) values (%L, %L)', bad.name, bad.slug), '23514', null,
  'tags rejects ' || bad.reason)
from (values
  ('', 'valid-new', 'empty name'), (' ', 'valid-new', 'space-only name'),
  (E'\t\n', 'valid-new', 'tab/newline-only name'),
  (' leading', 'valid-new', 'leading name space'), ('trailing ', 'valid-new', 'trailing name space'),
  (E'\tleading', 'valid-new', 'leading name tab'), (E'trailing\n', 'valid-new', 'trailing name newline'),
  (repeat('x', 121), 'valid-new', '121-character name'),
  ('Valid New', '', 'empty slug'), ('Valid New', ' ', 'blank slug'),
  ('Valid New', ' valid-new', 'leading slug space'), ('Valid New', 'valid-new ', 'trailing slug space'),
  ('Valid New', 'Uppercase', 'uppercase slug'), ('Valid New', 'two--hyphens', 'double hyphen'),
  ('Valid New', '-leading', 'leading hyphen'), ('Valid New', 'trailing-', 'trailing hyphen'),
  ('Valid New', 'under_score', 'punctuation in slug'), ('Valid New', 'café', 'non-ASCII slug'),
  ('Valid New', repeat('x', 121), '121-character slug')
) as bad(name, slug, reason);
select throws_ok(format('insert into public.tags (name, slug) values (%L, %L)', null, 'valid-new'), '23502', null, 'tags requires a name');
select throws_ok(format('insert into public.tags (name, slug) values (%L, %L)', 'Valid New', null), '23502', null, 'tags requires a slug');
select throws_ok(format('insert into public.tags (name, slug) values (%L, %L)', 'synthetic tag one', 'new-unique-slug'), '23505', null,
  'tags rejects case-insensitive duplicate names in its scope');
select throws_ok(format('insert into public.tags (name, slug) values (%L, %L)', 'Unique New Name', 'synthetic-tag-one'), '23505', null,
  'tags rejects duplicate slugs in its scope');
select lives_ok($$ update public.tags set updated_at = '2000-01-01' where slug = repeat('x', 120) $$,
  'tags accepts a privileged fixture update');
select is((select updated_at from public.tags where slug = repeat('x', 120)), now(),
  'tags refreshes updated_at instead of accepting a stale timestamp');
delete from public.tags where slug in ('z', repeat('x', 120));

select throws_ok($$ insert into public.categories (name, slug) values ('Missing Parent', 'missing-parent') $$,
  '23502', null, 'category requires a section');
select throws_ok($$ insert into public.categories (name, slug, section_id)
  values ('Missing Parent', 'missing-parent', '20000000-0000-0000-0000-000000000099') $$,
  '23503', null, 'category rejects nonexistent section');
select throws_ok($$ delete from public.sections where id = '20000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'referenced section cannot be deleted');
select throws_ok($$ update public.sections set id = '20000000-0000-0000-0000-000000000099'
  where id = '20000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'referenced section identity cannot be changed');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'anonymous: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'anonymous: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array[]::text[], 'anonymous: unpublished tags stay private');
select throws_ok($$ insert into public.sections (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'anonymous: sections insert denied');
select throws_ok($$ update public.sections set name = 'Forbidden' $$, '42501', null, 'anonymous: sections update denied');
select throws_ok($$ delete from public.sections $$, '42501', null, 'anonymous: sections delete denied');
select throws_ok($$ insert into public.categories (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'anonymous: categories insert denied');
select throws_ok($$ update public.categories set name = 'Forbidden' $$, '42501', null, 'anonymous: categories update denied');
select throws_ok($$ delete from public.categories $$, '42501', null, 'anonymous: categories delete denied');
select throws_ok($$ insert into public.tags (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'anonymous: tags insert denied');
select throws_ok($$ update public.tags set name = 'Forbidden' $$, '42501', null, 'anonymous: tags update denied');
select throws_ok($$ delete from public.tags $$, '42501', null, 'anonymous: tags delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'inactive member: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'inactive member: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array[]::text[], 'inactive member: unpublished tags stay private');
select throws_ok($$ insert into public.sections (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'inactive member: sections insert denied');
select throws_ok($$ update public.sections set name = 'Forbidden' $$, '42501', null, 'inactive member: sections update denied');
select throws_ok($$ delete from public.sections $$, '42501', null, 'inactive member: sections delete denied');
select throws_ok($$ insert into public.categories (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'inactive member: categories insert denied');
select throws_ok($$ update public.categories set name = 'Forbidden' $$, '42501', null, 'inactive member: categories update denied');
select throws_ok($$ delete from public.categories $$, '42501', null, 'inactive member: categories delete denied');
select throws_ok($$ insert into public.tags (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'inactive member: tags insert denied');
select throws_ok($$ update public.tags set name = 'Forbidden' $$, '42501', null, 'inactive member: tags update denied');
select throws_ok($$ delete from public.tags $$, '42501', null, 'inactive member: tags delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'Author A: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'Author A: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002']::text[], 'Author A: tags catalog visibility');
select throws_ok($$ insert into public.sections (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'Author A: sections insert denied');
select throws_ok($$ update public.sections set name = 'Forbidden' $$, '42501', null, 'Author A: sections update denied');
select throws_ok($$ delete from public.sections $$, '42501', null, 'Author A: sections delete denied');
select throws_ok($$ insert into public.categories (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'Author A: categories insert denied');
select throws_ok($$ update public.categories set name = 'Forbidden' $$, '42501', null, 'Author A: categories update denied');
select throws_ok($$ delete from public.categories $$, '42501', null, 'Author A: categories delete denied');
select throws_ok($$ insert into public.tags (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'Author A: tags insert denied');
select throws_ok($$ update public.tags set name = 'Forbidden' $$, '42501', null, 'Author A: tags update denied');
select throws_ok($$ delete from public.tags $$, '42501', null, 'Author A: tags delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'Author B: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'Author B: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002']::text[], 'Author B: tags catalog visibility');
select throws_ok($$ insert into public.sections (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'Author B: sections insert denied');
select throws_ok($$ update public.sections set name = 'Forbidden' $$, '42501', null, 'Author B: sections update denied');
select throws_ok($$ delete from public.sections $$, '42501', null, 'Author B: sections delete denied');
select throws_ok($$ insert into public.categories (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'Author B: categories insert denied');
select throws_ok($$ update public.categories set name = 'Forbidden' $$, '42501', null, 'Author B: categories update denied');
select throws_ok($$ delete from public.categories $$, '42501', null, 'Author B: categories delete denied');
select throws_ok($$ insert into public.tags (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'Author B: tags insert denied');
select throws_ok($$ update public.tags set name = 'Forbidden' $$, '42501', null, 'Author B: tags update denied');
select throws_ok($$ delete from public.tags $$, '42501', null, 'Author B: tags delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003']::text[], 'active administrator: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000005']::text[], 'active administrator: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array['40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002']::text[], 'active administrator: tags catalog visibility');
select throws_ok($$ insert into public.sections (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'active administrator: sections insert denied');
select throws_ok($$ update public.sections set name = 'Forbidden' $$, '42501', null, 'active administrator: sections update denied');
select throws_ok($$ delete from public.sections $$, '42501', null, 'active administrator: sections delete denied');
select throws_ok($$ insert into public.categories (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'active administrator: categories insert denied');
select throws_ok($$ update public.categories set name = 'Forbidden' $$, '42501', null, 'active administrator: categories update denied');
select throws_ok($$ delete from public.categories $$, '42501', null, 'active administrator: categories delete denied');
select throws_ok($$ insert into public.tags (name, slug) values ('Forbidden', 'forbidden') $$, '42501', null, 'active administrator: tags insert denied');
select throws_ok($$ update public.tags set name = 'Forbidden' $$, '42501', null, 'active administrator: tags update denied');
select throws_ok($$ delete from public.tags $$, '42501', null, 'active administrator: tags delete denied');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'non-Google administrator: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'non-Google administrator: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array[]::text[], 'non-Google administrator: unpublished tags stay private');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'unconfirmed administrator: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'unconfirmed administrator: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array[]::text[], 'unconfirmed administrator: unpublished tags stay private');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'synthetic-admin@example.test' where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'out-of-domain administrator: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'out-of-domain administrator: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array[]::text[], 'out-of-domain administrator: unpublished tags stay private');

set local role postgres;
update auth.users set email = 'gavel-taxonomy-4@bc.edu' where id = '00000000-0000-0000-0000-000000000004';
update public.memberships set active = false where user_id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select results_eq($$ select id::text from public.sections where id::text like '20000000-%' order by id $$,
  array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002']::text[], 'deactivated administrator: sections catalog visibility');
select results_eq($$ select id::text from public.categories where id::text like '30000000-%' order by id $$,
  array['30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005']::text[], 'deactivated administrator: categories catalog visibility');
select results_eq($$ select id::text from public.tags where id::text like '40000000-%' order by id $$,
  array[]::text[], 'deactivated administrator: unpublished tags stay private');

select * from finish();
rollback;
