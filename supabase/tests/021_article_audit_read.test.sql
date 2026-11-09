begin;
select no_plan();

update auth.users set email = 'audit-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004');

insert into public.audit_events(id,actor_user_id,action,resource_type,resource_id,created_at) values
  ('70000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000002',
    'article.created','article','50000000-0000-0000-0000-000000000081','2026-01-02T00:00:00Z'),
  ('70000000-0000-0000-0000-000000000082','00000000-0000-0000-0000-000000000004',
    'article.archived','article','50000000-0000-0000-0000-000000000081','2026-01-03T00:00:00Z');

select has_function('public','list_article_audit_events',
  array['integer','text','timestamp with time zone','uuid'], 'bounded audit reader exists');
select ok(not has_function_privilege('anon',
  'public.list_article_audit_events(integer,text,timestamp with time zone,uuid)','EXECUTE'),
  'anonymous has no audit RPC grant');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select throws_ok($$select * from public.list_article_audit_events()$$,'42501',null,
  'author cannot call audit reader');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select throws_ok($$select * from public.list_article_audit_events()$$,'42501',null,
  'inactive member cannot call audit reader');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select results_eq($$select event_id::text from public.list_article_audit_events(1)
  where event_id::text like '70000000-%'$$,
  array['70000000-0000-0000-0000-000000000082']::text[],
  'administrator gets bounded newest event');
select results_eq($$select event_id::text from public.list_article_audit_events(
    20,null,'2026-01-03T00:00:00Z','70000000-0000-0000-0000-000000000082')
  where event_id::text like '70000000-%'$$,
  array['70000000-0000-0000-0000-000000000081']::text[],
  'keyset cursor retrieves older event');
select is((select actor_label from public.list_article_audit_events(20,'article.created')
  where event_id='70000000-0000-0000-0000-000000000081'), 'Author A',
  'reader resolves actor display name without exposing Auth ID');
select results_eq($$select event_id::text from public.list_article_audit_events(20,'article.archived')
  where event_id::text like '70000000-%'$$,
  array['70000000-0000-0000-0000-000000000082']::text[],
  'archived-resource audit remains visible');
select throws_ok($$select * from public.list_article_audit_events(52)$$,'22023',null,
  'direct RPC cannot request an oversized page');
select throws_ok($$select * from public.list_article_audit_events(20,'article.owner_changed')$$,
  '22023',null,'unimplemented action cannot be requested');
select throws_ok($$select * from public.list_article_audit_events(
  20,null,'2026-01-03T00:00:00Z',null)$$,'22023',null,
  'partial cursor is rejected');

select * from finish();
rollback;
