begin;

-- Synthetic eligible Auth metadata for this transaction only.
update auth.users set email = 'gavel-pgtap-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004');

select plan(4);
select has_function('public', 'current_profile', array[]::text[], 'scoped profile accessor exists');
set local role anon;
select throws_ok($$ select * from public.current_profile() $$, '42501', null::text, 'anonymous users cannot invoke profile accessor');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq($$ select id from public.current_profile() $$,
  array['10000000-0000-0000-0000-000000000002'::uuid], 'Author A receives only their linked profile');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is_empty($$ select * from public.current_profile() $$, 'inactive members receive no authorization profile');
select * from finish();
rollback;
