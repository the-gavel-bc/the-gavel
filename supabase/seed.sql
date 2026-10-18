-- Synthetic local identities only. These rows have no passwords and cannot sign in.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'inactive@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000002', 'author-a@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000003', 'author-b@example.test', '{}'),
  ('00000000-0000-0000-0000-000000000004', 'administrator@example.test', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, auth_user_id, display_name, slug, biography)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Inactive Member',
    'inactive-member',
    'Synthetic local profile.'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Author A',
    'author-a',
    'Synthetic local author profile.'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    'Author B',
    'author-b',
    'Synthetic local author profile.'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000004',
    'Administrator',
    'administrator',
    'Synthetic local administrator profile.'
  )
on conflict (id) do nothing;

insert into public.memberships (
  user_id,
  role,
  active,
  approved_by,
  approved_at
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'author',
    false,
    null,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'author',
    true,
    '00000000-0000-0000-0000-000000000004',
    '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'author',
    true,
    '00000000-0000-0000-0000-000000000004',
    '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'administrator',
    true,
    '00000000-0000-0000-0000-000000000004',
    '2026-01-01T00:00:00Z'
  )
on conflict (user_id) do nothing;
