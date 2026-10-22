-- Additive support only; application writes remain closed.
alter table public.articles add column edit_version integer not null default 1 check (edit_version >= 1);

create table private.draft_write_limits (
  actor_user_id uuid primary key references auth.users(id) on update restrict on delete restrict,
  window_start timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 30)
);
create table private.draft_write_receipts (
  actor_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  request_id uuid not null,
  operation text not null check (operation in ('create','save')),
  article_id uuid not null,
  expected_version integer,
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  result_version integer not null check (result_version >= 1),
  result_updated_at timestamptz not null,
  changed boolean not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id),
  check ((operation = 'create' and expected_version is null)
    or (operation = 'save' and expected_version >= 1 and expected_version is not null))
);
alter table private.draft_write_limits enable row level security;
alter table private.draft_write_receipts enable row level security;
revoke all on table private.draft_write_limits, private.draft_write_receipts from public, anon, authenticated;
