begin;
select plan(17);

-- Synthetic eligible Auth metadata for this transaction only.
update auth.users set email = 'gavel-pgtap-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004');

set local role postgres;
update auth.users set email = 'synthetic-author@bc.edu', email_confirmed_at = now(), raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select is_empty($$ update public.profiles set display_name = 'Forbidden edit' where id = '10000000-0000-0000-0000-000000000002' returning 1 $$, 'non-Google active author cannot edit profile directly');
select is_empty($$ select * from public.current_profile() $$, 'non-Google active author receives no access profile');

set local role postgres;
update auth.users set email = 'synthetic-author@bc.edu', email_confirmed_at = null, raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select is_empty($$ update public.profiles set display_name = 'Forbidden edit' where id = '10000000-0000-0000-0000-000000000002' returning 1 $$, 'unconfirmed active author cannot edit profile directly');
select is_empty($$ select * from public.current_profile() $$, 'unconfirmed active author receives no access profile');

set local role postgres;
update auth.users set email = 'synthetic-author@example.test', email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select is_empty($$ update public.profiles set display_name = 'Forbidden edit' where id = '10000000-0000-0000-0000-000000000002' returning 1 $$, 'out-of-domain active author cannot edit profile directly');
select is_empty($$ select * from public.current_profile() $$, 'out-of-domain active author receives no access profile');

set local role postgres;
update auth.users set email = 'synthetic-admin@bc.edu', email_confirmed_at = now(), raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

select throws_ok($$ update public.memberships set role = 'administrator' where user_id = '00000000-0000-0000-0000-000000000003' returning 1 $$, '42501', null, 'non-Google administrator cannot manage memberships directly');
select is_empty($$ select user_id from public.memberships where user_id = '00000000-0000-0000-0000-000000000003' $$, 'non-Google administrator cannot read another membership');
select is_empty($$ select * from public.current_profile() $$, 'non-Google administrator receives no access profile');

set local role postgres;
update auth.users set email = 'synthetic-admin@bc.edu', email_confirmed_at = null, raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

select throws_ok($$ update public.memberships set role = 'administrator' where user_id = '00000000-0000-0000-0000-000000000003' returning 1 $$, '42501', null, 'unconfirmed administrator cannot manage memberships directly');
select is_empty($$ select user_id from public.memberships where user_id = '00000000-0000-0000-0000-000000000003' $$, 'unconfirmed administrator cannot read another membership');
select is_empty($$ select * from public.current_profile() $$, 'unconfirmed administrator receives no access profile');

set local role postgres;
update auth.users set email = 'synthetic-admin@example.test', email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb where id = '00000000-0000-0000-0000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

select throws_ok($$ update public.memberships set role = 'administrator' where user_id = '00000000-0000-0000-0000-000000000003' returning 1 $$, '42501', null, 'out-of-domain administrator cannot manage memberships directly');
select is_empty($$ select user_id from public.memberships where user_id = '00000000-0000-0000-0000-000000000003' $$, 'out-of-domain administrator cannot read another membership');
select is_empty($$ select * from public.current_profile() $$, 'out-of-domain administrator receives no access profile');

set local role postgres;

-- Synthetic eligible Auth metadata for this transaction only.
update auth.users set email = 'gavel-pgtap-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select results_eq($$ update public.profiles set display_name = 'Eligible edit' where id = '10000000-0000-0000-0000-000000000002' returning 1 $$, array[1], 'eligible active author retains profile editing');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is((public.change_membership_role('00000000-0000-0000-0000-000000000002',1,
  '80000000-0000-0000-0000-000000000922','administrator')->>'ok'),
  'true','eligible active administrator retains checked membership management');
select * from finish();
rollback;
