-- Match the article list's publication, section, and owner visibility.
-- The tag association index bounds the lookup to one tag's articles.
create function private.tag_has_public_articles(p_tag_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.article_tags atg
    join public.articles a on a.id = atg.article_id and a.status = 'published'
    join public.sections s on s.id = a.section_id and s.active
    join public.profiles p on p.id = a.owner_profile_id and p.active
    where atg.tag_id = p_tag_id
  );
$$;
revoke all on function private.tag_has_public_articles(uuid) from public, anon, authenticated, service_role;
grant execute on function private.tag_has_public_articles(uuid) to anon, authenticated;

drop policy tags_catalog_read on public.tags;
create policy tags_anon_read on public.tags for select to anon
using (private.tag_has_public_articles(id));
create policy tags_authenticated_read on public.tags for select to authenticated
using (
  (select exists (select 1 from public.current_profile()))
  or private.tag_has_public_articles(id)
);

alter policy profiles_authenticated_read on public.profiles using (
  (active and (auth_user_id is not null
    or (select exists (select 1 from public.current_profile()))))
  or (select private.is_active_administrator())
);
revoke select (id, created_at, updated_at) on public.profiles from anon;
