-- Private article storage only. Workflow mutations and public projections are deferred.
create type public.article_status as enum ('draft', 'published', 'archived');

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on update restrict on delete restrict,
  section_id uuid not null references public.sections(id) on update restrict on delete restrict,
  title text not null constraint articles_title_check
    check (char_length(title) between 1 and 240 and title !~ '(^[[:space:]]|[[:space:]]$)'),
  slug text not null unique constraint articles_slug_check
    check (char_length(slug) between 1 and 180 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt text constraint articles_excerpt_check
    check (excerpt is null or (char_length(excerpt) between 1 and 600 and excerpt !~ '(^[[:space:]]|[[:space:]]$)')),
  content jsonb constraint articles_content_check
    check (content is null or (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1048576)),
  seo_keyphrase text constraint articles_seo_keyphrase_check
    check (seo_keyphrase is null or (char_length(seo_keyphrase) between 1 and 160 and seo_keyphrase !~ '(^[[:space:]]|[[:space:]]$)')),
  meta_description text constraint articles_meta_description_check
    check (meta_description is null or (char_length(meta_description) between 1 and 320 and meta_description !~ '(^[[:space:]]|[[:space:]]$)')),
  status public.article_status not null default 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_status_timestamps_check check (
    (status = 'draft' and published_at is null and archived_at is null)
    or (status = 'published' and published_at is not null and archived_at is null)
    or (status = 'archived' and published_at is not null and archived_at is not null)
  )
);

create index articles_owner_profile_id_idx on public.articles (owner_profile_id);
create index articles_section_id_idx on public.articles (section_id);
create trigger articles_set_updated_at before update on public.articles
for each row execute function private.set_updated_at();

-- Resolve the private Auth link without exposing it or recursively evaluating
-- article RLS. The caller supplies only a resource ID, never an identity.
create function private.can_read_article(check_article_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_eligible_identity()
    and exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.active
    )
    and exists (
      select 1 from public.articles a
      join public.profiles p on p.id = a.owner_profile_id
      where a.id = check_article_id
        and (p.auth_user_id = auth.uid() or private.is_active_administrator())
    );
$$;
revoke all on function private.can_read_article(uuid) from public, anon;
grant execute on function private.can_read_article(uuid) to authenticated;

alter table public.articles enable row level security;
revoke all on table public.articles from public, anon, authenticated;
grant select on table public.articles to authenticated;
create policy articles_owner_or_admin_read on public.articles for select to authenticated
using (private.can_read_article(id));
