begin;
select plan(168);

-- Privileged synthetic fixtures and authoritative Auth changes roll back.
update auth.users set email = 'gavel-article-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');
insert into public.sections (id, name, slug) values
  ('20000000-0000-0000-0000-000000000011', 'Synthetic Article Section', 'synthetic-article-section');
insert into public.articles (id, owner_profile_id, section_id, title, slug) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', 'Synthetic A Draft', 'synthetic-a-draft'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Synthetic B Draft', 'synthetic-b-draft'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000011', 'Synthetic Inactive Draft', 'synthetic-inactive-draft');
insert into public.articles (id, owner_profile_id, section_id, title, slug, status, published_at, archived_at) values
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', 'Synthetic Published', 'synthetic-published', 'published', now(), null),
  ('50000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', 'Synthetic Archived', 'synthetic-archived', 'archived', now(), now());
select ok((select status = 'draft' and published_at is null and archived_at is null
  and excerpt is null and content is null and seo_keyphrase is null and meta_description is null
  and created_at = now() and updated_at = now() from public.articles where id = '50000000-0000-0000-0000-000000000001'),
  'new draft defaults allow absent body and optional metadata');
select lives_ok($$ insert into public.articles (owner_profile_id, section_id, title, slug)
  values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', 'Generated UUID', 'generated-uuid') $$,
  'article supplies its UUID and draft defaults');
select ok((select id is not null from public.articles where slug = 'generated-uuid'), 'article UUID is populated');
delete from public.articles where slug = 'generated-uuid';

-- title: SQL NULL semantics, character bounds, and trimmed nonblank input.
select throws_ok($$ update public.articles set title = null where id = '50000000-0000-0000-0000-000000000001' $$, '23502', null, 'title is required');
select lives_ok($$ update public.articles set title = repeat('é', 1) where id = '50000000-0000-0000-0000-000000000001' $$, 'title accepts 1 characters including multibyte text');
select lives_ok($$ update public.articles set title = repeat('é', 240) where id = '50000000-0000-0000-0000-000000000001' $$, 'title accepts 240 characters including multibyte text');
select throws_ok(format('update public.articles set title = %L where id = %L', bad.value, '50000000-0000-0000-0000-000000000001'),
  '23514', null, 'title rejects ' || bad.reason)
from (values ('', 'empty text'), (' ', 'space-only text'), (E'\t\n', 'tab/newline-only text'),
  (' leading', 'leading space'), ('trailing ', 'trailing space'),
  (E'\tleading', 'leading tab'), (E'trailing\n', 'trailing newline'),
  (repeat('x', 241), '241 characters')) as bad(value, reason);

-- excerpt: SQL NULL semantics, character bounds, and trimmed nonblank input.
select lives_ok($$ update public.articles set excerpt = null where id = '50000000-0000-0000-0000-000000000001' $$, 'excerpt accepts SQL NULL');
select lives_ok($$ update public.articles set excerpt = repeat('é', 1) where id = '50000000-0000-0000-0000-000000000001' $$, 'excerpt accepts 1 characters including multibyte text');
select lives_ok($$ update public.articles set excerpt = repeat('é', 600) where id = '50000000-0000-0000-0000-000000000001' $$, 'excerpt accepts 600 characters including multibyte text');
select throws_ok(format('update public.articles set excerpt = %L where id = %L', bad.value, '50000000-0000-0000-0000-000000000001'),
  '23514', null, 'excerpt rejects ' || bad.reason)
from (values ('', 'empty text'), (' ', 'space-only text'), (E'\t\n', 'tab/newline-only text'),
  (' leading', 'leading space'), ('trailing ', 'trailing space'),
  (E'\tleading', 'leading tab'), (E'trailing\n', 'trailing newline'),
  (repeat('x', 601), '601 characters')) as bad(value, reason);

-- seo_keyphrase: SQL NULL semantics, character bounds, and trimmed nonblank input.
select lives_ok($$ update public.articles set seo_keyphrase = null where id = '50000000-0000-0000-0000-000000000001' $$, 'seo_keyphrase accepts SQL NULL');
select lives_ok($$ update public.articles set seo_keyphrase = repeat('é', 1) where id = '50000000-0000-0000-0000-000000000001' $$, 'seo_keyphrase accepts 1 characters including multibyte text');
select lives_ok($$ update public.articles set seo_keyphrase = repeat('é', 160) where id = '50000000-0000-0000-0000-000000000001' $$, 'seo_keyphrase accepts 160 characters including multibyte text');
select throws_ok(format('update public.articles set seo_keyphrase = %L where id = %L', bad.value, '50000000-0000-0000-0000-000000000001'),
  '23514', null, 'seo_keyphrase rejects ' || bad.reason)
from (values ('', 'empty text'), (' ', 'space-only text'), (E'\t\n', 'tab/newline-only text'),
  (' leading', 'leading space'), ('trailing ', 'trailing space'),
  (E'\tleading', 'leading tab'), (E'trailing\n', 'trailing newline'),
  (repeat('x', 161), '161 characters')) as bad(value, reason);

-- meta_description: SQL NULL semantics, character bounds, and trimmed nonblank input.
select lives_ok($$ update public.articles set meta_description = null where id = '50000000-0000-0000-0000-000000000001' $$, 'meta_description accepts SQL NULL');
select lives_ok($$ update public.articles set meta_description = repeat('é', 1) where id = '50000000-0000-0000-0000-000000000001' $$, 'meta_description accepts 1 characters including multibyte text');
select lives_ok($$ update public.articles set meta_description = repeat('é', 320) where id = '50000000-0000-0000-0000-000000000001' $$, 'meta_description accepts 320 characters including multibyte text');
select throws_ok(format('update public.articles set meta_description = %L where id = %L', bad.value, '50000000-0000-0000-0000-000000000001'),
  '23514', null, 'meta_description rejects ' || bad.reason)
from (values ('', 'empty text'), (' ', 'space-only text'), (E'\t\n', 'tab/newline-only text'),
  (' leading', 'leading space'), ('trailing ', 'trailing space'),
  (E'\tleading', 'leading tab'), (E'trailing\n', 'trailing newline'),
  (repeat('x', 321), '321 characters')) as bad(value, reason);

select lives_ok($$ update public.articles set slug = 'z' where id = '50000000-0000-0000-0000-000000000001' $$, 'slug accepts one character');
select lives_ok($$ update public.articles set slug = repeat('x', 180) where id = '50000000-0000-0000-0000-000000000001' $$, 'slug accepts 180 characters');
select throws_ok(format('update public.articles set slug = %L where id = %L', bad.value, '50000000-0000-0000-0000-000000000001'),
  '23514', null, 'slug rejects ' || bad.reason)
from (values ('', 'empty text'), (' ', 'blank text'), (' leading', 'leading space'), ('trailing ', 'trailing space'),
  ('Uppercase', 'uppercase'), ('double--hyphen', 'double hyphen'), ('-leading', 'leading hyphen'),
  ('trailing-', 'trailing hyphen'), ('under_score', 'punctuation'), ('café', 'non-ASCII'),
  (repeat('x', 181), '181 characters')) as bad(value, reason);
select throws_ok($$ update public.articles set slug = null where id = '50000000-0000-0000-0000-000000000001' $$, '23502', null, 'slug is required');
select throws_ok($$ update public.articles set slug = 'synthetic-b-draft' where id = '50000000-0000-0000-0000-000000000001' $$, '23505', null, 'article slug is globally unique');
select lives_ok($$ update public.articles set slug = 'synthetic-a-draft' where id = '50000000-0000-0000-0000-000000000001' $$, 'restore synthetic draft slug');

select lives_ok($$ update public.articles set content = null where id = '50000000-0000-0000-0000-000000000001' $$, 'body accepts SQL NULL');
select lives_ok($$ update public.articles set content = '{}'::jsonb where id = '50000000-0000-0000-0000-000000000001' $$, 'body accepts an empty JSON object');
select throws_ok(format('update public.articles set content = %L::jsonb where id = %L', bad.value, '50000000-0000-0000-0000-000000000001'),
  '23514', null, 'body rejects JSON ' || bad.reason)
from (values ('[]', 'array'), ('"text"', 'string'), ('42', 'number'), ('true', 'boolean'), ('null', 'null')) as bad(value, reason);

-- Size is the serialized JSONB value, including syntax bytes. Compute fixture
-- overhead independently so ASCII and multibyte values reach the exact bound.
create temporary table content_bounds (kind text, payload jsonb);
insert into content_bounds
select 'ascii', jsonb_build_object('text', repeat('x', 1048576 - octet_length(jsonb_build_object('text', '')::text)))
union all
select 'multibyte', jsonb_build_object('text', repeat('é', (1048576 - octet_length(jsonb_build_object('text', '')::text)) / 2)
  || repeat('x', (1048576 - octet_length(jsonb_build_object('text', '')::text)) % 2));
select is(octet_length(payload::text), 1048576, kind || ' fixture is exactly 1 MiB serialized') from content_bounds;
select lives_ok(format('update public.articles set content = %L::jsonb where id = %L', payload::text, '50000000-0000-0000-0000-000000000001'),
  kind || ' body accepts exactly 1 MiB') from content_bounds;
update content_bounds set payload = jsonb_build_object('text', (payload ->> 'text') || 'x');
select is(octet_length(payload::text), 1048577, kind || ' over-limit fixture is exactly 1 MiB plus one byte') from content_bounds;
select throws_ok(format('update public.articles set content = %L::jsonb where id = %L', payload::text, '50000000-0000-0000-0000-000000000001'),
  '23514', null, kind || ' body rejects one serialized byte over 1 MiB') from content_bounds;
update public.articles set content = null where id = '50000000-0000-0000-0000-000000000001';

-- All twelve status/timestamp combinations: only three are valid.
select lives_ok(format('update public.articles set status = %L, published_at = %s, archived_at = %s where id = %L',
  valid.status, valid.publication, valid.archive, '50000000-0000-0000-0000-000000000001'),
  'accepts ' || valid.status || ' timestamp combination')
from (values ('draft', 'null', 'null'), ('published', 'now()', 'null'), ('archived', 'now()', 'now()')) as valid(status, publication, archive);
select throws_ok(format('update public.articles set status = %L, published_at = %s, archived_at = %s where id = %L',
  bad.status, bad.publication, bad.archive, '50000000-0000-0000-0000-000000000001'), '23514', null,
  'rejects invalid ' || bad.status || ' timestamps: ' || bad.publication || '/' || bad.archive)
from (values ('draft', 'now()', 'null'), ('draft', 'null', 'now()'), ('draft', 'now()', 'now()'),
  ('published', 'null', 'null'), ('published', 'null', 'now()'), ('published', 'now()', 'now()'),
  ('archived', 'null', 'null'), ('archived', 'now()', 'null'), ('archived', 'null', 'now()')) as bad(status, publication, archive);
select throws_ok($$ update public.articles set status = 'scheduled' where id = '50000000-0000-0000-0000-000000000001' $$, '22P02', null, 'unapproved lifecycle status rejected');
select throws_ok($$ update public.articles set status = null where id = '50000000-0000-0000-0000-000000000001' $$, '23502', null, 'status is required');
update public.articles set status = 'draft', published_at = null, archived_at = null where id = '50000000-0000-0000-0000-000000000001';

select lives_ok($$ update public.articles set updated_at = '2000-01-01' where id = '50000000-0000-0000-0000-000000000001' $$, 'privileged fixture update succeeds');
select is((select updated_at from public.articles where id = '50000000-0000-0000-0000-000000000001'), now(), 'article trigger refreshes a stale updated_at');

select throws_ok($$ update public.articles set owner_profile_id = null where id = '50000000-0000-0000-0000-000000000001' $$, '23502', null, 'owner_profile_id is required');
select throws_ok($$ update public.articles set owner_profile_id = '90000000-0000-0000-0000-000000000099' where id = '50000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'owner_profile_id rejects a missing reference');
select throws_ok($$ delete from public.profiles where id = '10000000-0000-0000-0000-000000000002' $$, '23503', null, 'referenced profiles deletion is restricted');
select throws_ok($$ update public.profiles set id = '90000000-0000-0000-0000-000000000099' where id = '10000000-0000-0000-0000-000000000002' $$,
  '23503', null, 'referenced profiles identity change is restricted');

select throws_ok($$ update public.articles set section_id = null where id = '50000000-0000-0000-0000-000000000001' $$, '23502', null, 'section_id is required');
select throws_ok($$ update public.articles set section_id = '90000000-0000-0000-0000-000000000099' where id = '50000000-0000-0000-0000-000000000001' $$,
  '23503', null, 'section_id rejects a missing reference');
select throws_ok($$ delete from public.sections where id = '20000000-0000-0000-0000-000000000011' $$, '23503', null, 'referenced sections deletion is restricted');
select throws_ok($$ update public.sections set id = '90000000-0000-0000-0000-000000000099' where id = '20000000-0000-0000-0000-000000000011' $$,
  '23503', null, 'referenced sections identity change is restricted');

select is_empty($$ select column_name from information_schema.columns where table_schema = 'public' and table_name = 'articles'
  and column_name in ('main_image_id', 'image_credit') $$, 'media columns remain deferred');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.articles $$, '42501', null, 'anonymous has no article grant, even for published fixtures');
select throws_ok($$ select private.can_read_article('50000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'anonymous cannot execute private article predicate');
select throws_ok($$ insert into public.articles (owner_profile_id, section_id, title, slug) values ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Forbidden', 'forbidden') $$, '42501', null, 'anonymous: insert denied');
select throws_ok($$ update public.articles set content = '{}'::jsonb $$, '42501', null, 'anonymous: update body denied');
select throws_ok($$ update public.articles set owner_profile_id = '10000000-0000-0000-0000-000000000003' $$, '42501', null, 'anonymous: forge owner denied');
select throws_ok($$ update public.articles set status = 'published', published_at = now() $$, '42501', null, 'anonymous: publish denied');
select throws_ok($$ delete from public.articles $$, '42501', null, 'anonymous: delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is_empty($$ select id from public.articles $$, 'inactive owner cannot read articles');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'inactive owner: predicate respects A ownership');
select is(private.can_read_article('50000000-0000-0000-0000-000000000002'), false, 'inactive owner: supplying B article ID grants no extra access');
select is(private.can_read_article('90000000-0000-0000-0000-000000000099'), false, 'inactive owner: missing article returns false');
select is(private.can_read_article(null), false, 'inactive owner: null article returns false');
select throws_ok($$ select auth_user_id from public.profiles $$, '42501', null, 'inactive owner: private profile linkage remains inaccessible');
select throws_ok($$ insert into public.articles (owner_profile_id, section_id, title, slug) values ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Forbidden', 'forbidden') $$, '42501', null, 'inactive owner: insert denied');
select throws_ok($$ update public.articles set content = '{}'::jsonb $$, '42501', null, 'inactive owner: update body denied');
select throws_ok($$ update public.articles set owner_profile_id = '10000000-0000-0000-0000-000000000003' $$, '42501', null, 'inactive owner: forge owner denied');
select throws_ok($$ update public.articles set status = 'published', published_at = now() $$, '42501', null, 'inactive owner: publish denied');
select throws_ok($$ delete from public.articles $$, '42501', null, 'inactive owner: delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq($$ select id::text from public.articles where id::text like '50000000-%' order by id $$,
  array['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005']::text[], 'Author A without credits reads exactly permitted article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), true, 'Author A without credits: predicate respects A ownership');
select is(private.can_read_article('50000000-0000-0000-0000-000000000002'), false, 'Author A without credits: supplying B article ID grants no extra access');
select is(private.can_read_article('90000000-0000-0000-0000-000000000099'), false, 'Author A without credits: missing article returns false');
select is(private.can_read_article(null), false, 'Author A without credits: null article returns false');
select throws_ok($$ select auth_user_id from public.profiles $$, '42501', null, 'Author A without credits: private profile linkage remains inaccessible');
select throws_ok($$ insert into public.articles (owner_profile_id, section_id, title, slug) values ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Forbidden', 'forbidden') $$, '42501', null, 'Author A without credits: insert denied');
select throws_ok($$ update public.articles set content = '{}'::jsonb $$, '42501', null, 'Author A without credits: update body denied');
select throws_ok($$ update public.articles set owner_profile_id = '10000000-0000-0000-0000-000000000003' $$, '42501', null, 'Author A without credits: forge owner denied');
select throws_ok($$ update public.articles set status = 'published', published_at = now() $$, '42501', null, 'Author A without credits: publish denied');
select throws_ok($$ delete from public.articles $$, '42501', null, 'Author A without credits: delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select results_eq($$ select id::text from public.articles where id::text like '50000000-%' order by id $$,
  array['50000000-0000-0000-0000-000000000002']::text[], 'Author B reads exactly permitted article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'Author B: predicate respects A ownership');
select is(private.can_read_article('50000000-0000-0000-0000-000000000002'), true, 'Author B: supplying B article ID grants no extra access');
select is(private.can_read_article('90000000-0000-0000-0000-000000000099'), false, 'Author B: missing article returns false');
select is(private.can_read_article(null), false, 'Author B: null article returns false');
select throws_ok($$ select auth_user_id from public.profiles $$, '42501', null, 'Author B: private profile linkage remains inaccessible');
select throws_ok($$ insert into public.articles (owner_profile_id, section_id, title, slug) values ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Forbidden', 'forbidden') $$, '42501', null, 'Author B: insert denied');
select throws_ok($$ update public.articles set content = '{}'::jsonb $$, '42501', null, 'Author B: update body denied');
select throws_ok($$ update public.articles set owner_profile_id = '10000000-0000-0000-0000-000000000003' $$, '42501', null, 'Author B: forge owner denied');
select throws_ok($$ update public.articles set status = 'published', published_at = now() $$, '42501', null, 'Author B: publish denied');
select throws_ok($$ delete from public.articles $$, '42501', null, 'Author B: delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select id::text from public.articles where id::text like '50000000-%' order by id $$,
  array['50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000005']::text[], 'eligible active administrator reads exactly permitted article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), true, 'eligible active administrator: predicate respects A ownership');
select is(private.can_read_article('50000000-0000-0000-0000-000000000002'), true, 'eligible active administrator: supplying B article ID grants no extra access');
select is(private.can_read_article('90000000-0000-0000-0000-000000000099'), false, 'eligible active administrator: missing article returns false');
select is(private.can_read_article(null), false, 'eligible active administrator: null article returns false');
select throws_ok($$ select auth_user_id from public.profiles $$, '42501', null, 'eligible active administrator: private profile linkage remains inaccessible');
select throws_ok($$ insert into public.articles (owner_profile_id, section_id, title, slug) values ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000011', 'Forbidden', 'forbidden') $$, '42501', null, 'eligible active administrator: insert denied');
select throws_ok($$ update public.articles set content = '{}'::jsonb $$, '42501', null, 'eligible active administrator: update body denied');
select throws_ok($$ update public.articles set owner_profile_id = '10000000-0000-0000-0000-000000000003' $$, '42501', null, 'eligible active administrator: forge owner denied');
select throws_ok($$ update public.articles set status = 'published', published_at = now() $$, '42501', null, 'eligible active administrator: publish denied');
select throws_ok($$ delete from public.articles $$, '42501', null, 'eligible active administrator: delete denied');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb, raw_user_meta_data = '{"provider":"google"}'::jsonb where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select id from public.articles $$, 'non-Google owner cannot read even published article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'non-Google owner cannot use the predicate to bypass identity checks');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select id from public.articles $$, 'unconfirmed owner cannot read even published article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'unconfirmed owner cannot use the predicate to bypass identity checks');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'synthetic-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select id from public.articles $$, 'out-of-domain owner cannot read even published article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'out-of-domain owner cannot use the predicate to bypass identity checks');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb, raw_user_meta_data = '{"provider":"google"}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select id from public.articles $$, 'non-Google administrator cannot read even published article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'non-Google administrator cannot use the predicate to bypass identity checks');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select id from public.articles $$, 'unconfirmed administrator cannot read even published article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'unconfirmed administrator cannot use the predicate to bypass identity checks');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'synthetic-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select id from public.articles $$, 'out-of-domain administrator cannot read even published article fixtures');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'out-of-domain administrator cannot use the predicate to bypass identity checks');

set local role postgres;
update auth.users set email = 'gavel-article-4@bc.edu' where id = '00000000-0000-0000-0000-000000000004';
update public.memberships set active = false where user_id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is_empty($$ select id from public.articles $$, 'deactivated administrator loses all article access');
select is(private.can_read_article('50000000-0000-0000-0000-000000000001'), false, 'predicate rechecks current membership');

select * from finish();
rollback;
