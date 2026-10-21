-- Additive taxonomy storage. Application mutations remain closed in Phase 2.

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint sections_name_check
    check (char_length(name) between 1 and 120 and name !~ '(^[[:space:]]|[[:space:]]$)'),
  slug text not null constraint sections_slug_check
    check (char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  navigation_order integer not null default 0 constraint sections_navigation_order_check check (navigation_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_slug_key unique (slug)
);
create unique index sections_name_key on public.sections (lower(name));
create trigger sections_set_updated_at before update on public.sections
for each row execute function private.set_updated_at();
alter table public.sections enable row level security;
revoke all on table public.sections from public, anon, authenticated;
grant select on table public.sections to anon, authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on update restrict on delete restrict,
  name text not null constraint categories_name_check
    check (char_length(name) between 1 and 120 and name !~ '(^[[:space:]]|[[:space:]]$)'),
  slug text not null constraint categories_slug_check
    check (char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  navigation_order integer not null default 0 constraint categories_navigation_order_check check (navigation_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_slug_key unique (section_id, slug)
);
create unique index categories_name_key on public.categories (section_id, lower(name));
create trigger categories_set_updated_at before update on public.categories
for each row execute function private.set_updated_at();
alter table public.categories enable row level security;
revoke all on table public.categories from public, anon, authenticated;
grant select on table public.categories to anon, authenticated;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint tags_name_check
    check (char_length(name) between 1 and 120 and name !~ '(^[[:space:]]|[[:space:]]$)'),
  slug text not null constraint tags_slug_check
    check (char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_slug_key unique (slug)
);
create unique index tags_name_key on public.tags (lower(name));
create trigger tags_set_updated_at before update on public.tags
for each row execute function private.set_updated_at();
alter table public.tags enable row level security;
revoke all on table public.tags from public, anon, authenticated;
grant select on table public.tags to anon, authenticated;

-- Separate policies keep anonymous reads independent of private helper grants.
create policy sections_anon_read on public.sections for select to anon
using (active);
create policy sections_authenticated_read on public.sections for select to authenticated
using (active or (select private.is_active_administrator()));

-- Explicit parent activation is required even when an administrator can see it.
create policy categories_anon_read on public.categories for select to anon
using (active and exists (
  select 1 from public.sections s where s.id = categories.section_id and s.active
));
create policy categories_authenticated_read on public.categories for select to authenticated
using ((active and exists (
  select 1 from public.sections s where s.id = categories.section_id and s.active
)) or (select private.is_active_administrator()));

create policy tags_catalog_read on public.tags for select to anon, authenticated
using (true);
