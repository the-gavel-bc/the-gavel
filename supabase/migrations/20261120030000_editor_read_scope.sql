-- Editors read articles that are in review (drafts with a pending submission)
-- and articles they published. Earlier the first branch ignored status, so an
-- article that was submitted, published, then archived stayed readable by every
-- editor. Only the 'read' mode changes.
create or replace function private.article_authority(p_article_id uuid, p_user_id uuid, p_mode text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.articles a
    join public.memberships m on m.user_id = p_user_id and m.active
    join public.profiles me on me.auth_user_id = p_user_id and me.active
    where a.id = p_article_id
      and case p_mode
        when 'edit' then m.role = 'administrator'
          or (a.status = 'draft' and (
            (a.owner_profile_id = me.id and a.review_requested_at is null)
            or (m.role = 'editor' and a.review_requested_at is not null)))
        when 'read' then m.role = 'administrator' or a.owner_profile_id = me.id
          or (m.role = 'editor' and (
            (a.status = 'draft' and a.review_requested_at is not null)
            or a.published_by_profile_id = me.id))
        when 'replay' then m.role in ('administrator', 'editor') or a.owner_profile_id = me.id
        when 'submit' then a.owner_profile_id = me.id
        when 'review' then m.role in ('administrator', 'editor')
        when 'publish' then m.role = 'administrator'
          or (m.role = 'editor' and (a.owner_profile_id = me.id or a.review_requested_at is not null))
        when 'archive' then m.role = 'administrator'
          or (m.role = 'editor' and a.published_by_profile_id = me.id)
        else false end
  );
$$;
comment on function private.article_authority(uuid, uuid, text) is
  'Precondition: the caller has proven the Auth identity is eligible and the actor is locked.';
