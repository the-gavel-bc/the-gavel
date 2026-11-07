begin;

-- Synthetic eligible Auth metadata for this transaction only.
update auth.users set email = 'gavel-pgtap-' || right(id::text, 1) || '@bc.edu',
  email_confirmed_at = now(), raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb
where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004');


create extension if not exists pgtap with schema extensions;

select plan(25);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_type('public', 'app_role', 'app_role enum exists');
select results_eq(
  $$
    select enumlabel
    from pg_enum
    join pg_type on pg_type.oid = pg_enum.enumtypid
    join pg_namespace on pg_namespace.oid = pg_type.typnamespace
    where pg_namespace.nspname = 'public'
      and pg_type.typname = 'app_role'
    order by enumsortorder
  $$,
  $$ values ('author'::name), ('administrator'::name) $$,
  'app_role contains only author and administrator'
);
select col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');
select col_is_pk(
  'public',
  'memberships',
  'user_id',
  'memberships.user_id is the primary key'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.profiles'::regclass $$,
  array[true],
  'profiles has row level security enabled'
);
select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.memberships'::regclass $$,
  array[true],
  'memberships has row level security enabled'
);
select ok(
  has_column_privilege('anon', 'public.profiles', 'display_name', 'select'),
  'anonymous readers may select public display names'
);
select ok(
  not has_column_privilege('anon', 'public.profiles', 'auth_user_id', 'select'),
  'anonymous readers cannot select auth identity links'
);
select ok(
  has_table_privilege('authenticated', 'public.memberships', 'select'),
  'authenticated users may query memberships subject to RLS'
);

set local role anon;
select results_eq(
  $$ select count(id) from public.profiles $$,
  array[4::bigint],
  'anonymous readers see active public profiles'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);
select results_eq(
  $$
    update public.profiles
    set display_name = 'Author A Updated'
    where id = '10000000-0000-0000-0000-000000000002'
    returning 1
  $$,
  array[1],
  'Author A may update their own profile'
);
select is_empty(
  $$
    update public.profiles
    set display_name = 'Unauthorized change'
    where id = '10000000-0000-0000-0000-000000000003'
    returning 1
  $$,
  'Author A cannot update Author B profile'
);
select throws_ok(
  $$
    insert into public.memberships (user_id, role, active)
    values ('00000000-0000-0000-0000-000000000099', 'author', true)
  $$,
  '42501', null::text,
  'normal authors cannot insert memberships'
);
select throws_ok(
  $$
    update public.memberships
    set role = 'administrator'
    where user_id = '00000000-0000-0000-0000-000000000002'
    returning 1
  $$,
  '42501', null::text,
  'normal authors cannot change their membership directly'
);
select results_eq(
  $$
    select count(*)
    from public.memberships
    where user_id = '00000000-0000-0000-0000-000000000003'
  $$,
  array[0::bigint],
  'Author A cannot read Author B membership'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$ select count(*) from public.memberships where active $$,
  array[0::bigint],
  'inactive membership yields no active dashboard authorization row'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004',
  true
);
select results_eq(
  $$ select count(*) from public.memberships $$,
  array[4::bigint],
  'active administrators may read all memberships'
);
select is(
  (public.approve_membership('00000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000921','author','Inactive Member',1)->>'ok'),
  'true',
  'active administrators approve through the audited RPC'
);

set local role postgres;
update public.memberships set active = false, revoked_at = now()
where user_id = '00000000-0000-0000-0000-000000000001';
set local role authenticated;

-- Profile editing also requires current membership approval.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is_empty(
  $$ update public.profiles set display_name = 'Inactive edit'
     where id = '10000000-0000-0000-0000-000000000001' returning 1 $$,
  'inactive members cannot edit their profile'
);
select throws_ok(
  $$ delete from public.memberships where user_id = '00000000-0000-0000-0000-000000000001' returning 1 $$,
  '42501', null::text,
  'inactive members cannot delete memberships directly'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ delete from public.memberships where user_id = '00000000-0000-0000-0000-000000000003' returning 1 $$,
  '42501', null::text,
  'authors cannot delete another membership directly'
);
select throws_ok(
  $$ select auth_user_id from public.profiles $$,
  '42501', null::text,
  'authenticated readers cannot retrieve private profile identity links'
);
set local role anon;
select throws_ok(
  $$ select * from public.memberships $$,
  '42501', null::text,
  'anonymous readers cannot retrieve memberships'
);
select * from finish();
rollback;
