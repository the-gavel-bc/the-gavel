alter table public.sections add column edit_version integer not null default 1 check (edit_version>0);
alter table public.categories add column edit_version integer not null default 1 check (edit_version>0);

alter table public.audit_events drop constraint audit_events_action_resource_check;
alter table public.audit_events add constraint audit_events_action_resource_check check (
  (resource_type='article' and action in ('article.created','article.updated','article.published',
    'article.archived','article.restored','article.deleted','article.owner_changed')) or
  (resource_type='membership' and action in ('membership.approved','membership.role_changed','membership.deactivated')) or
  (resource_type='profile' and action in ('profile.created','profile.updated','profile.deactivated')) or
  (resource_type='section' and action='section.updated') or
  (resource_type='category' and action='category.updated')
);
create table private.taxonomy_write_receipts (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  kind text not null check (kind in ('section','category')),
  resource_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key(actor_user_id,request_id)
);
revoke all on table private.taxonomy_write_receipts from public,anon,authenticated;
