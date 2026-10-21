-- Protected storage only. No automatic capture, restoration or client mutations.
create table public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  actor_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  snapshot_version integer not null default 1 check (snapshot_version = 1),
  snapshot jsonb not null check (
    jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 2097152
  )
);
create index article_revisions_article_id_idx on public.article_revisions (article_id);
create index article_revisions_actor_user_id_idx on public.article_revisions (actor_user_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on update restrict on delete restrict,
  action text not null check (action in (
    'article.created', 'article.updated', 'article.published', 'article.archived',
    'article.restored', 'article.deleted', 'article.owner_changed'
  )),
  resource_type text not null check (resource_type = 'article'),
  -- Retain the identifier independently of any future article deletion.
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  correlation_id uuid
);
create index audit_events_resource_id_idx on public.audit_events (resource_id);
create index audit_events_actor_user_id_idx on public.audit_events (actor_user_id);

alter table public.article_revisions enable row level security;
revoke all on table public.article_revisions from public, anon, authenticated;
grant select on table public.article_revisions to authenticated;
create policy article_revisions_article_read on public.article_revisions for select to authenticated
using (private.can_read_article(article_id));

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from public, anon, authenticated;
grant select on table public.audit_events to authenticated;
create policy audit_events_administrator_read on public.audit_events for select to authenticated
using ((select private.is_active_administrator()));
