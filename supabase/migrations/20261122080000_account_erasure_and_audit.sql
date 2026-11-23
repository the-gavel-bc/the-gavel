-- Retain content and audit history through Auth account deletion.
alter table public.audit_events
  alter column actor_user_id drop not null,
  drop constraint audit_events_actor_user_id_fkey,
  add constraint audit_events_actor_user_id_fkey
    foreign key(actor_user_id) references auth.users(id) on update restrict on delete set null;
alter table public.article_revisions
  alter column actor_user_id drop not null,
  drop constraint article_revisions_actor_user_id_fkey,
  add constraint article_revisions_actor_user_id_fkey
    foreign key(actor_user_id) references auth.users(id) on update restrict on delete set null;
alter table public.media_assets
  alter column uploader_user_id drop not null,
  drop constraint media_assets_uploader_user_id_fkey,
  add constraint media_assets_uploader_user_id_fkey
    foreign key(uploader_user_id) references auth.users(id) on update restrict on delete set null;

-- A missing approver after erasure does not undo approval or reactivate access.
alter table public.memberships drop constraint memberships_approval_state_check;
alter table public.memberships add constraint memberships_approval_state_check check (
  (active and approved_at is not null and revoked_at is null)
  or (not active and (approved_at is not null or approved_by is null))
);
alter table private.membership_invitations
  alter column invited_by drop not null,
  drop constraint membership_invitations_invited_by_fkey,
  add constraint membership_invitations_invited_by_fkey
    foreign key(invited_by) references auth.users(id) on update restrict on delete set null;

-- Only actor-owned ephemeral state cascades. Article/profile resource IDs and
-- invitation records are retained without conferring any new authorization.
do $$
declare item text;
begin
  foreach item in array array[
    'article_deletion_receipts','draft_write_limits','draft_write_receipts',
    'homepage_write_receipts','media_write_receipts','membership_write_receipts',
    'profile_write_receipts','site_information_receipts','taxonomy_write_receipts'
  ] loop
    execute pg_catalog.format(
      'alter table private.%I drop constraint %I, add constraint %I foreign key(actor_user_id) references auth.users(id) on update restrict on delete cascade',
      item,item||'_actor_user_id_fkey',item||'_actor_user_id_fkey');
  end loop;
end;
$$;

create function private.guard_audit_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- A nested Auth foreign key action may clear the actor after that user
  -- disappears. Every other column must be identical. Direct updates fail.
  if tg_op='UPDATE' and pg_catalog.pg_trigger_depth()>1
    and old.actor_user_id is not null and new.actor_user_id is null
    and (to_jsonb(old)-'actor_user_id')=(to_jsonb(new)-'actor_user_id')
    and not exists(select 1 from auth.users u where u.id=old.actor_user_id) then
    return new;
  end if;
  raise exception 'Audit events are immutable.' using errcode='55000';
end;
$$;
revoke all on function private.guard_audit_mutation() from public,anon,authenticated,service_role;
revoke update,delete,truncate on public.audit_events from public,anon,authenticated,service_role;
create trigger audit_events_guard_update before update on public.audit_events
  for each row execute function private.guard_audit_mutation();
create trigger audit_events_guard_delete before delete or truncate on public.audit_events
  for each statement execute function private.guard_audit_mutation();

create function private.anonymize_erased_member()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_profile uuid;
begin
  -- Auth has already locked the user row. Fail fast if an editorial command
  -- holds the global locks so it can finish without a lock-order inversion.
  if not pg_catalog.pg_try_advisory_xact_lock(72300320261107::bigint)
    or not pg_catalog.pg_try_advisory_xact_lock(72300320261106::bigint) then
    raise exception 'Editorial writes are in progress. Retry account erasure.' using errcode='55P03';
  end if;
  if exists(select 1 from public.memberships m join public.profiles p on p.auth_user_id=m.user_id
      where m.user_id=old.id and m.active and m.role='administrator' and p.active)
    and private.has_eligible_identity_for(old.id)
    and not exists(select 1 from public.memberships m join public.profiles p on p.auth_user_id=m.user_id
      where m.user_id<>old.id and m.active and m.role='administrator' and p.active
      and private.has_eligible_identity_for(m.user_id)) then
    raise exception 'Cannot erase the last eligible administrator.' using errcode='55000';
  end if;
  select p.id into target_profile from public.profiles p where p.auth_user_id=old.id for update;
  if target_profile is not null then
    -- Preserve the existing profile ID and active flag for article reads.
    update public.profiles set display_name='Gavel contributor',biography=null,
      slug='erased-'||target_profile,public_page_hidden=true,photo_updated_at=null
    where id=target_profile;
    delete from private.profile_photos where profile_id=target_profile;
  end if;
  -- Retire previously claimed and currently open invitations for this identity.
  update private.membership_invitations i
    set email='erased-'||i.id||'@bc.edu',display_name=null,claimed_user_id=null,
      claimed_at=null,removed_at=coalesce(i.removed_at,statement_timestamp())
    where i.claimed_user_id=old.id or i.email=pg_catalog.lower(old.email);
  return old;
end;
$$;
revoke all on function private.anonymize_erased_member() from public,anon,authenticated,service_role;
create trigger anonymize_erased_member before delete on auth.users
  for each row execute function private.anonymize_erased_member();
