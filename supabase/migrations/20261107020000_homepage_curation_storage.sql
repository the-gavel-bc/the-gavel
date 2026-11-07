-- The singleton and ordered links contain only internal article identifiers.
create table public.homepage_curation (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid
    check (id='00000000-0000-0000-0000-000000000001'::uuid),
  edit_version integer not null default 1 check (edit_version>0),
  updated_at timestamptz not null default now()
);
insert into public.homepage_curation(id)
  values('00000000-0000-0000-0000-000000000001');
create trigger homepage_curation_set_updated_at before update on public.homepage_curation
for each row execute function private.set_updated_at();

create table public.homepage_selections (
  group_name text not null check (group_name in ('lead','featured','read_this')),
  position integer not null check (position between 1 and 50),
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  primary key(group_name,position),
  unique(group_name,article_id),
  check (group_name<>'lead' or position=1)
);
alter table public.homepage_curation enable row level security;
alter table public.homepage_selections enable row level security;
revoke all on table public.homepage_curation,public.homepage_selections from public,anon,authenticated;

create table private.homepage_write_receipts (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key(actor_user_id,request_id)
);
revoke all on table private.homepage_write_receipts from public,anon,authenticated;

alter table public.audit_events drop constraint audit_events_action_resource_check;
alter table public.audit_events add constraint audit_events_action_resource_check check (
  (resource_type='article' and action in ('article.created','article.updated','article.published',
    'article.archived','article.restored','article.deleted','article.owner_changed')) or
  (resource_type='membership' and action in ('membership.approved','membership.role_changed','membership.deactivated')) or
  (resource_type='profile' and action in ('profile.created','profile.updated','profile.deactivated')) or
  (resource_type='section' and action='section.updated') or
  (resource_type='category' and action='category.updated') or
  (resource_type='homepage' and action='homepage.updated')
);
