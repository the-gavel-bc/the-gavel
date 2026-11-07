alter table public.profiles
  add column edit_version integer not null default 1 check (edit_version > 0),
  add column slug_frozen boolean not null default false;

update public.profiles p set slug_frozen=true where exists (
  select 1 from public.articles a where a.owner_profile_id=p.id
    and a.status in ('published','archived')
) or exists (
  select 1 from public.article_contributors c
  join public.articles a on a.id=c.article_id
  where c.profile_id=p.id and a.status in ('published','archived')
);

alter table public.audit_events drop constraint audit_events_action_resource_check;
alter table public.audit_events add constraint audit_events_action_resource_check check (
  (resource_type='article' and action in (
    'article.created','article.updated','article.published','article.archived',
    'article.restored','article.deleted','article.owner_changed'
  )) or (resource_type='membership' and action in (
    'membership.approved','membership.role_changed','membership.deactivated'
  )) or (resource_type='profile' and action in (
    'profile.created','profile.updated','profile.deactivated'
  ))
);

create table private.profile_write_receipts (
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  operation text not null check (operation in ('create','save','deactivate')),
  profile_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key(actor_user_id,request_id)
);
revoke all on table private.profile_write_receipts from public,anon,authenticated;

create function private.profile_slug_base(p_name text)
returns text language plpgsql stable set search_path='' as $$
declare normalized text;
begin
  normalized := pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.lower(extensions.unaccent(p_name)) collate "C",'[^a-z0-9]+','-','g'),'-');
  normalized := pg_catalog.rtrim(pg_catalog.left(normalized,180),'-');
  return coalesce(nullif(normalized,''),'author');
end;
$$;
revoke all on function private.profile_slug_base(text) from public,anon,authenticated;

create function private.allocate_profile_slug(p_name text,p_profile_id uuid)
returns text language plpgsql volatile set search_path = '' as $$
declare base text := private.profile_slug_base(p_name);
  candidate text; suffix text; holder uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  for n in 1..10000 loop
    suffix := case when n=1 then '' else '-' || n::text end;
    candidate := pg_catalog.rtrim(
      pg_catalog.left(base,180-pg_catalog.char_length(suffix)),'-') || suffix;
    select id into holder from public.profiles where slug=candidate;
    if holder is null or holder=p_profile_id then return candidate; end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.allocate_profile_slug(text,uuid) from public,anon,authenticated;

-- Task 9's one-argument allocator remains for existing compiled calls; use
-- the new canonical base for later member approvals too.
create or replace function private.allocate_profile_slug(p_name text)
returns text language sql volatile set search_path='' as $$
  select private.allocate_profile_slug(p_name,null::uuid);
$$;

-- The guarded RPCs in the next migration replace these direct writes.
