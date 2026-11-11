begin;
select plan(124);

-- Synthetic fixtures only; all Auth/content/history rows roll back.
update auth.users set email = 'gavel-history-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');
-- Isolated actors ensure foundation memberships cannot mask history FK defects.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000041', 'synthetic-revision-actor@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000042', 'synthetic-audit-actor@example.test', '{}');
insert into public.sections (id, name, slug) values
  ('20000000-0000-0000-0000-000000000041', 'Synthetic History Section', 'synthetic-history-section');
insert into public.articles (id, owner_profile_id, section_id, title, slug) values
  ('50000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000041', 'Synthetic History A', 'synthetic-history-a'),
  ('50000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000041', 'Synthetic History B', 'synthetic-history-b'),
  ('50000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000041', 'Synthetic History Inactive', 'synthetic-history-inactive'),
  ('50000000-0000-0000-0000-000000000044', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000041', 'Synthetic Revision Reference', 'synthetic-revision-reference');
insert into public.article_contributors values
  ('50000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000003', 'writer', 0);
-- Crossed actors prove visibility follows article ownership, never edit credit.
insert into public.article_revisions (id, article_id, actor_user_id, snapshot) values
  ('60000000-0000-0000-0000-000000000041', '50000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000003', '{"title":"Synthetic A snapshot"}'),
  ('60000000-0000-0000-0000-000000000042', '50000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000002', '{"title":"Synthetic B snapshot"}'),
  ('60000000-0000-0000-0000-000000000043', '50000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000003', '{}'),
  ('60000000-0000-0000-0000-000000000044', '50000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000041', '{}');
select lives_ok($$ insert into public.article_revisions (article_id, actor_user_id, snapshot) values
  ('50000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000002', '{"fixture":"history-defaults"}') $$,
  'revision UUID, version and timestamp defaults allow a minimal snapshot object');
select ok((select id is not null and snapshot_version = 1 and created_at = now() from public.article_revisions
  where article_id = '50000000-0000-0000-0000-000000000041' and snapshot ->> 'fixture' = 'history-defaults'),
  'revision defaults supply UUID, version one and creation time');
delete from public.article_revisions where article_id = '50000000-0000-0000-0000-000000000041' and snapshot ->> 'fixture' = 'history-defaults';

select lives_ok($$ update public.article_revisions set snapshot_version = 1, snapshot = '{}' where id = '60000000-0000-0000-0000-000000000041' $$,
  'revision accepts version one and an empty object');
select throws_ok(format('update public.article_revisions set snapshot_version = %s where id = %L', version, '60000000-0000-0000-0000-000000000041'),
  '23514', null, 'revision rejects snapshot version ' || version::text) from (values (-1), (0), (2)) as bad(version);
select throws_ok($$ update public.article_revisions set snapshot_version = null $$, '23502', null, 'revision version is required');
select throws_ok($$ update public.article_revisions set snapshot = null $$, '23502', null, 'snapshot SQL NULL rejected');
select throws_ok(format('update public.article_revisions set snapshot = %L::jsonb where id = %L', value, '60000000-0000-0000-0000-000000000041'),
  '23514', null, 'revision rejects JSON ' || kind)
from (values ('[]', 'array'), ('"text"', 'string'), ('42', 'number'), ('true', 'boolean'), ('null', 'null')) as bad(value, kind);

create temporary table snapshot_bounds (kind text, payload jsonb);
insert into snapshot_bounds
select 'ascii', jsonb_build_object('text', repeat('x', 2097152 - octet_length(jsonb_build_object('text', '')::text)))
union all
select 'multibyte', jsonb_build_object('text', repeat('é', (2097152 - octet_length(jsonb_build_object('text', '')::text)) / 2)
  || repeat('x', (2097152 - octet_length(jsonb_build_object('text', '')::text)) % 2));
select is(octet_length(payload::text), 2097152, kind || ' fixture is exactly 2 MiB serialized') from snapshot_bounds;
select lives_ok(format('update public.article_revisions set snapshot = %L::jsonb where id = %L', payload::text, '60000000-0000-0000-0000-000000000041'),
  kind || ' snapshot accepts exactly 2 MiB') from snapshot_bounds;
update snapshot_bounds set payload = jsonb_build_object('text', (payload ->> 'text') || 'x');
select is(octet_length(payload::text), 2097153, kind || ' oversized fixture is exactly 2 MiB plus one byte') from snapshot_bounds;
select throws_ok(format('update public.article_revisions set snapshot = %L::jsonb where id = %L', payload::text, '60000000-0000-0000-0000-000000000041'),
  '23514', null, kind || ' snapshot rejects one serialized byte above 2 MiB') from snapshot_bounds;
update public.article_revisions set snapshot = '{"title":"Synthetic A snapshot"}' where id = '60000000-0000-0000-0000-000000000041';
select throws_ok($$ update public.article_revisions set article_id = null where id = '60000000-0000-0000-0000-000000000041' $$, '23502', null, 'revision requires article_id');
select throws_ok($$ update public.article_revisions set article_id = '90000000-0000-0000-0000-000000000099' where id = '60000000-0000-0000-0000-000000000041' $$, '23503', null, 'revision rejects missing article_id');
select throws_ok($$ update public.article_revisions set actor_user_id = null where id = '60000000-0000-0000-0000-000000000041' $$, '23502', null, 'revision requires actor_user_id');
select throws_ok($$ update public.article_revisions set actor_user_id = '90000000-0000-0000-0000-000000000099' where id = '60000000-0000-0000-0000-000000000041' $$, '23503', null, 'revision rejects missing actor_user_id');
select throws_ok($$ delete from public.articles where id = '50000000-0000-0000-0000-000000000044' $$, '23503', null, 'revision-only article deletion is restricted');
select throws_ok($$ update public.articles set id = '90000000-0000-0000-0000-000000000099' where id = '50000000-0000-0000-0000-000000000044' $$, '23503', null, 'revision-only article identity change is restricted');
select throws_ok($$ delete from auth.users where id = '00000000-0000-0000-0000-000000000041' $$, '23503', null, 'revision-only actor deletion is restricted');
select throws_ok($$ update auth.users set id = '90000000-0000-0000-0000-000000000099' where id = '00000000-0000-0000-0000-000000000041' $$, '23503', null, 'revision-only actor identity change is restricted');
delete from public.article_revisions where id = '60000000-0000-0000-0000-000000000044';
delete from public.articles where id = '50000000-0000-0000-0000-000000000044';
select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042', 'article.created', 'article', '50000000-0000-0000-0000-000000000041') $$, 'audit accepts article.created');
select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000042', 'article.updated', 'article', '50000000-0000-0000-0000-000000000041') $$, 'audit accepts article.updated');
select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000042', 'article.published', 'article', '50000000-0000-0000-0000-000000000041') $$, 'audit accepts article.published');
select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000042', 'article.archived', 'article', '50000000-0000-0000-0000-000000000041') $$, 'audit accepts article.archived');
select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000042', 'article.restored', 'article', '50000000-0000-0000-0000-000000000041') $$, 'audit accepts article.restored');
select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000042', 'article.deleted', 'article', '50000000-0000-0000-0000-000000000041') $$, 'audit accepts article.deleted');
select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000042', 'article.owner_changed', 'article', '50000000-0000-0000-0000-000000000041') $$, 'audit accepts article.owner_changed');

select lives_ok($$ insert into public.audit_events (id, actor_user_id, action, resource_type, resource_id) values
  ('70000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000042', 'article.deleted', 'article', '50000000-0000-0000-0000-000000000099') $$,
  'audit may retain a resource UUID without a current article');
select lives_ok($$ insert into public.audit_events (actor_user_id, action, resource_type, resource_id) values
  ('00000000-0000-0000-0000-000000000042', 'article.created', 'article', '50000000-0000-0000-0000-000000000098') $$,
  'audit supplies UUID and timestamp defaults');
select ok((select id is not null and created_at = now() and correlation_id is null from public.audit_events
  where resource_id = '50000000-0000-0000-0000-000000000098'), 'audit defaults include NULL correlation');
delete from public.audit_events where resource_id = '50000000-0000-0000-0000-000000000098';
select lives_ok($$ update public.audit_events set correlation_id = '80000000-0000-0000-0000-000000000041' $$, 'audit correlation accepts a UUID');
select lives_ok($$ update public.audit_events set correlation_id = null $$, 'audit correlation accepts NULL');
select throws_ok($$ update public.audit_events set correlation_id = 'not-a-uuid' $$, '22P02', null, 'audit correlation rejects malformed UUID');
select throws_ok(format('update public.audit_events set action = %L', value), '23514', null, 'audit rejects unapproved action: ' || value)
from (values ('article.scheduled'), ('membership.approved'), (''), ('ARTICLE.CREATED')) as bad(value);
select throws_ok(format('update public.audit_events set resource_type = %L', value), '23514', null, 'audit rejects resource type: ' || value)
from (values ('profile'), ('Article'), ('')) as bad(value);
select results_eq($$ select column_name::text collate "default" from information_schema.columns where table_schema = 'public' and table_name = 'audit_events' order by column_name $$,
  array['action','actor_user_id','correlation_id','created_at','id','resource_id','resource_type']::text[],
  'audit uses only the accepted metadata columns, with no body, snapshot or free-form payload');
select throws_ok($$ update public.audit_events set actor_user_id = null $$, '23502', null, 'audit requires actor_user_id');
select throws_ok($$ update public.audit_events set action = null $$, '23502', null, 'audit requires action');
select throws_ok($$ update public.audit_events set resource_type = null $$, '23502', null, 'audit requires resource_type');
select throws_ok($$ update public.audit_events set resource_id = null $$, '23502', null, 'audit requires resource_id');
select throws_ok($$ update public.audit_events set created_at = null $$, '23502', null, 'audit requires created_at');

select throws_ok($$ update public.audit_events set actor_user_id = '90000000-0000-0000-0000-000000000099' $$,
  '23503', null, 'audit actor must exist');
select throws_ok($$ delete from auth.users where id = '00000000-0000-0000-0000-000000000042' $$,
  '23503', null, 'audit-only actor deletion is restricted');
select throws_ok($$ update auth.users set id = '90000000-0000-0000-0000-000000000099' where id = '00000000-0000-0000-0000-000000000042' $$,
  '23503', null, 'audit-only actor identity change is restricted');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.article_revisions $$, '42501', null, 'anonymous cannot read revisions');
select throws_ok($$ select * from public.audit_events $$, '42501', null, 'anonymous cannot read audits');
select throws_ok($$ insert into public.article_revisions (article_id, actor_user_id, snapshot) values ('50000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', '{}') $$, '42501', null, 'anonymous: article_revisions forged actor insert denied');
select throws_ok($$ update public.article_revisions set snapshot = '{}' $$, '42501', null, 'anonymous: article_revisions payload update denied');
select throws_ok($$ update public.article_revisions set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'anonymous: article_revisions actor update denied');
select throws_ok($$ delete from public.article_revisions $$, '42501', null, 'anonymous: article_revisions delete denied');
select throws_ok($$ insert into public.audit_events (actor_user_id, action, resource_type, resource_id) values ('00000000-0000-0000-0000-000000000004', 'article.created', 'article', '50000000-0000-0000-0000-000000000041') $$, '42501', null, 'anonymous: audit_events forged actor insert denied');
select throws_ok($$ update public.audit_events set action = 'article.deleted' $$, '42501', null, 'anonymous: audit_events payload update denied');
select throws_ok($$ update public.audit_events set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'anonymous: audit_events actor update denied');
select throws_ok($$ delete from public.audit_events $$, '42501', null, 'anonymous: audit_events delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is_empty($$ select id from public.article_revisions $$, 'inactive owner has no revision access');
select is_empty($$ select * from public.audit_events $$, 'inactive owner cannot read audits');
select throws_ok($$ insert into public.article_revisions (article_id, actor_user_id, snapshot) values ('50000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', '{}') $$, '42501', null, 'inactive owner: article_revisions forged actor insert denied');
select throws_ok($$ update public.article_revisions set snapshot = '{}' $$, '42501', null, 'inactive owner: article_revisions payload update denied');
select throws_ok($$ update public.article_revisions set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'inactive owner: article_revisions actor update denied');
select throws_ok($$ delete from public.article_revisions $$, '42501', null, 'inactive owner: article_revisions delete denied');
select throws_ok($$ insert into public.audit_events (actor_user_id, action, resource_type, resource_id) values ('00000000-0000-0000-0000-000000000004', 'article.created', 'article', '50000000-0000-0000-0000-000000000041') $$, '42501', null, 'inactive owner: audit_events forged actor insert denied');
select throws_ok($$ update public.audit_events set action = 'article.deleted' $$, '42501', null, 'inactive owner: audit_events payload update denied');
select throws_ok($$ update public.audit_events set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'inactive owner: audit_events actor update denied');
select throws_ok($$ delete from public.audit_events $$, '42501', null, 'inactive owner: audit_events delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq($$ select id::text from public.article_revisions where id::text like '60000000-%' order by id $$,
  array['60000000-0000-0000-0000-000000000041']::text[], 'Author A without credits reads revisions strictly by article authority');
select is_empty($$ select * from public.audit_events $$, 'Author A without credits cannot read audits');
select throws_ok($$ insert into public.article_revisions (article_id, actor_user_id, snapshot) values ('50000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', '{}') $$, '42501', null, 'Author A without credits: article_revisions forged actor insert denied');
select throws_ok($$ update public.article_revisions set snapshot = '{}' $$, '42501', null, 'Author A without credits: article_revisions payload update denied');
select throws_ok($$ update public.article_revisions set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'Author A without credits: article_revisions actor update denied');
select throws_ok($$ delete from public.article_revisions $$, '42501', null, 'Author A without credits: article_revisions delete denied');
select throws_ok($$ select actor_user_id from public.article_revisions $$, '42501', null, 'Author A cannot read revision actor Auth IDs');
select throws_ok($$ select * from public.article_revisions $$, '42501', null, 'Author A cannot select every revision column');
select throws_ok($$ insert into public.audit_events (actor_user_id, action, resource_type, resource_id) values ('00000000-0000-0000-0000-000000000004', 'article.created', 'article', '50000000-0000-0000-0000-000000000041') $$, '42501', null, 'Author A without credits: audit_events forged actor insert denied');
select throws_ok($$ update public.audit_events set action = 'article.deleted' $$, '42501', null, 'Author A without credits: audit_events payload update denied');
select throws_ok($$ update public.audit_events set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'Author A without credits: audit_events actor update denied');
select throws_ok($$ delete from public.audit_events $$, '42501', null, 'Author A without credits: audit_events delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select results_eq($$ select id::text from public.article_revisions where id::text like '60000000-%' order by id $$,
  array['60000000-0000-0000-0000-000000000042']::text[], 'Author B credited and acting on A reads revisions strictly by article authority');
select is_empty($$ select * from public.audit_events $$, 'Author B credited and acting on A cannot read audits');
select throws_ok($$ insert into public.article_revisions (article_id, actor_user_id, snapshot) values ('50000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', '{}') $$, '42501', null, 'Author B credited and acting on A: article_revisions forged actor insert denied');
select throws_ok($$ update public.article_revisions set snapshot = '{}' $$, '42501', null, 'Author B credited and acting on A: article_revisions payload update denied');
select throws_ok($$ update public.article_revisions set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'Author B credited and acting on A: article_revisions actor update denied');
select throws_ok($$ delete from public.article_revisions $$, '42501', null, 'Author B credited and acting on A: article_revisions delete denied');
select throws_ok($$ insert into public.audit_events (actor_user_id, action, resource_type, resource_id) values ('00000000-0000-0000-0000-000000000004', 'article.created', 'article', '50000000-0000-0000-0000-000000000041') $$, '42501', null, 'Author B credited and acting on A: audit_events forged actor insert denied');
select throws_ok($$ update public.audit_events set action = 'article.deleted' $$, '42501', null, 'Author B credited and acting on A: audit_events payload update denied');
select throws_ok($$ update public.audit_events set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'Author B credited and acting on A: audit_events actor update denied');
select throws_ok($$ delete from public.audit_events $$, '42501', null, 'Author B credited and acting on A: audit_events delete denied');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select results_eq($$ select id::text from public.article_revisions where id::text like '60000000-%' order by id $$,
  array['60000000-0000-0000-0000-000000000041', '60000000-0000-0000-0000-000000000042', '60000000-0000-0000-0000-000000000043']::text[], 'eligible active administrator reads revisions strictly by article authority');
select results_eq($$ select id::text from public.audit_events where id::text like '70000000-%' order by id $$,
  array['70000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-000000000042', '70000000-0000-0000-0000-000000000043', '70000000-0000-0000-0000-000000000044', '70000000-0000-0000-0000-000000000045', '70000000-0000-0000-0000-000000000046', '70000000-0000-0000-0000-000000000047', '70000000-0000-0000-0000-000000000048']::text[], 'administrator reads all accepted audit actions and retained resource IDs');
select throws_ok($$ insert into public.article_revisions (article_id, actor_user_id, snapshot) values ('50000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000004', '{}') $$, '42501', null, 'eligible active administrator: article_revisions forged actor insert denied');
select throws_ok($$ update public.article_revisions set snapshot = '{}' $$, '42501', null, 'eligible active administrator: article_revisions payload update denied');
select throws_ok($$ update public.article_revisions set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'eligible active administrator: article_revisions actor update denied');
select throws_ok($$ delete from public.article_revisions $$, '42501', null, 'eligible active administrator: article_revisions delete denied');
select throws_ok($$ insert into public.audit_events (actor_user_id, action, resource_type, resource_id) values ('00000000-0000-0000-0000-000000000004', 'article.created', 'article', '50000000-0000-0000-0000-000000000041') $$, '42501', null, 'eligible active administrator: audit_events forged actor insert denied');
select throws_ok($$ update public.audit_events set action = 'article.deleted' $$, '42501', null, 'eligible active administrator: audit_events payload update denied');
select throws_ok($$ update public.audit_events set actor_user_id = '00000000-0000-0000-0000-000000000004' $$, '42501', null, 'eligible active administrator: audit_events actor update denied');
select throws_ok($$ delete from public.audit_events $$, '42501', null, 'eligible active administrator: audit_events delete denied');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select id from public.article_revisions $$, 'non-Google owner cannot read article_revisions');
select is_empty($$ select * from public.audit_events $$, 'non-Google owner cannot read audit_events');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select id from public.article_revisions $$, 'unconfirmed owner cannot read article_revisions');
select is_empty($$ select * from public.audit_events $$, 'unconfirmed owner cannot read audit_events');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'gavel-history-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is_empty($$ select id from public.article_revisions $$, 'out-of-domain owner cannot read article_revisions');
select is_empty($$ select * from public.audit_events $$, 'out-of-domain owner cannot read audit_events');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select id from public.article_revisions $$, 'non-Google administrator cannot read article_revisions');
select is_empty($$ select * from public.audit_events $$, 'non-Google administrator cannot read audit_events');

set local role postgres;
update auth.users set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb, email_confirmed_at = null where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select id from public.article_revisions $$, 'unconfirmed administrator cannot read article_revisions');
select is_empty($$ select * from public.audit_events $$, 'unconfirmed administrator cannot read audit_events');

set local role postgres;
update auth.users set email_confirmed_at = now(), email = 'gavel-history-ineligible-' || right(id::text, 1) || '@example.test' where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is_empty($$ select id from public.article_revisions $$, 'out-of-domain administrator cannot read article_revisions');
select is_empty($$ select * from public.audit_events $$, 'out-of-domain administrator cannot read audit_events');

set local role postgres;
update auth.users set email = 'gavel-history-4@bc.edu' where id = '00000000-0000-0000-0000-000000000004';
update public.memberships set active = false where user_id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is_empty($$ select id from public.article_revisions $$, 'deactivated administrator loses revision reads');
select is_empty($$ select * from public.audit_events $$, 'deactivated administrator loses audit reads');

select * from finish();
rollback;
