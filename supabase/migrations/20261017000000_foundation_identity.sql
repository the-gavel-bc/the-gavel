create type public.app_role as enum ('author', 'administrator');

create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  biography text check (biography is null or char_length(biography) <= 5000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'author',
  active boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  revoked_at timestamptz,
  constraint memberships_approval_state_check check (
    (active and approved_by is not null and approved_at is not null and revoked_at is null)
    or
    (not active and (
      (approved_by is null and approved_at is null)
      or
      (approved_by is not null and approved_at is not null)
    ))
  )
);

create index profiles_active_slug_idx on public.profiles (active, slug);
create index memberships_active_role_idx on public.memberships (active, role);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create function private.is_active_administrator(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = check_user_id
      and active
      and role = 'administrator'
  );
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.is_active_administrator(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_administrator(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.memberships from anon, authenticated;

grant select (id, display_name, slug, biography, active, created_at, updated_at)
on public.profiles to anon, authenticated;
grant update (display_name, slug, biography)
on public.profiles to authenticated;

grant select, insert, update, delete
on public.memberships to authenticated;

create policy profiles_public_read
on public.profiles
for select
to anon
using (active);

create policy profiles_authenticated_read
on public.profiles
for select
to authenticated
using (
  active
  or auth_user_id = auth.uid()
  or private.is_active_administrator()
);

create policy profiles_owner_or_admin_update
on public.profiles
for update
to authenticated
using (
  (auth_user_id = auth.uid() and exists (
    select 1 from public.memberships where user_id = auth.uid() and active
  ))
  or private.is_active_administrator()
)
with check (
  (auth_user_id = auth.uid() and exists (
    select 1 from public.memberships where user_id = auth.uid() and active
  ))
  or private.is_active_administrator()
);

create policy memberships_self_or_admin_read
on public.memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_active_administrator()
);

create policy memberships_admin_insert
on public.memberships
for insert
to authenticated
with check (private.is_active_administrator());

create policy memberships_admin_update
on public.memberships
for update
to authenticated
using (private.is_active_administrator())
with check (private.is_active_administrator());

create policy memberships_admin_delete
on public.memberships
for delete
to authenticated
using (private.is_active_administrator());
