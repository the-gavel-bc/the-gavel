-- Membership management is one release unit with the following operation migration.
alter table public.memberships
  add column edit_version integer not null default 1 check (edit_version > 0);

alter table public.audit_events
  drop constraint audit_events_action_check,
  drop constraint audit_events_resource_type_check;
alter table public.audit_events add constraint audit_events_action_resource_check check (
  (resource_type = 'article' and action in (
    'article.created', 'article.updated', 'article.published',
    'article.archived', 'article.restored', 'article.deleted',
    'article.owner_changed'
  )) or
  (resource_type = 'membership' and action in (
    'membership.approved', 'membership.role_changed', 'membership.deactivated'
  ))
);

create table private.membership_write_receipts (
  actor_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  request_id uuid not null,
  operation text not null check (operation in ('approve', 'change_role', 'deactivate')),
  target_user_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id)
);
revoke all on table private.membership_write_receipts from public, anon, authenticated;

create function private.membership_payload_hash(p_payload jsonb)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function private.membership_payload_hash(jsonb)
from public, anon, authenticated;

create function private.allocate_profile_slug(p_name text)
returns text language plpgsql volatile set search_path = '' as $$
declare base text := private.article_slug_base(p_name);
  candidate text; suffix text; holder uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  for n in 1..10000 loop
    suffix := case when n = 1 then '' else '-' || n::text end;
    candidate := pg_catalog.rtrim(
      pg_catalog.left(base, 180 - pg_catalog.char_length(suffix)), '-') || suffix;
    select id into holder from public.profiles where slug = candidate;
    if holder is null then return candidate; end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.allocate_profile_slug(text)
from public, anon, authenticated;
