-- Association storage only; credits are presentation metadata, never authority.
create type public.contribution_role as enum ('writer', 'editor', 'creative');

create table public.article_tags (
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  tag_id uuid not null references public.tags(id) on update restrict on delete restrict,
  primary key (article_id, tag_id)
);
create index article_tags_tag_id_idx on public.article_tags (tag_id);

create table public.article_contributors (
  article_id uuid not null references public.articles(id) on update restrict on delete restrict,
  profile_id uuid not null references public.profiles(id) on update restrict on delete restrict,
  contribution_role public.contribution_role not null,
  display_order integer not null default 0 check (display_order >= 0),
  primary key (article_id, profile_id, contribution_role)
);
create index article_contributors_profile_id_idx on public.article_contributors (profile_id);

alter table public.article_tags enable row level security;
revoke all on table public.article_tags from public, anon, authenticated;
grant select on table public.article_tags to authenticated;
create policy article_tags_article_read on public.article_tags for select to authenticated
using (private.can_read_article(article_id));

alter table public.article_contributors enable row level security;
revoke all on table public.article_contributors from public, anon, authenticated;
grant select on table public.article_contributors to authenticated;
create policy article_contributors_article_read on public.article_contributors for select to authenticated
using (private.can_read_article(article_id));
