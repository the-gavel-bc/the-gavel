-- Give each half of the review queue its own share of the existing row budget.
create or replace function public.list_review_articles()
returns table(article_id uuid, title text, status text, owner_name text, section_name text,
  submitted_at timestamptz, published_at timestamptz, edit_version integer)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_profile uuid;
begin
  select p.id into actor_profile from public.profiles p
    join public.memberships m on m.user_id=p.auth_user_id and m.active and m.role in ('editor','administrator')
    where p.auth_user_id=actor and p.active and private.has_eligible_identity();
  if actor_profile is null then
    raise exception 'Editor access required.' using errcode='42501'; end if;
  return query
    with limited(id, title, status, owner_name, section_name, submitted_at, published_at, edit_version) as (
    (select a.id, a.title, a.status::text, o.display_name, s.name,
      a.review_requested_at, a.published_at, a.edit_version
    from public.articles a
    join public.profiles o on o.id=a.owner_profile_id
    join public.sections s on s.id=a.section_id
    where a.status='draft' and a.review_requested_at is not null
    order by a.review_requested_at, a.id
    limit 50)
    union all
    (select a.id, a.title, a.status::text, o.display_name, s.name,
      a.review_requested_at, a.published_at, a.edit_version
    from public.articles a
    join public.profiles o on o.id=a.owner_profile_id
    join public.sections s on s.id=a.section_id
    where a.status='published' and a.published_by_profile_id=actor_profile
    order by a.published_at desc, a.id desc
    limit 50))
    select q.* from limited q
    order by q.status, q.submitted_at asc nulls last, q.published_at desc nulls last,
      (case when q.status='draft' then q.id end) asc, q.id desc;
end;
$$;
