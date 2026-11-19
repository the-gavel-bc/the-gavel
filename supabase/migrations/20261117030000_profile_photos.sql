-- A person with an account can add a small photo that shows in the About
-- section of their public author page. The processed image (square WebP) is
-- stored in the database: it is tiny, needs no Storage policy, and is only
-- readable through the functions below.
alter table public.profiles add column photo_updated_at timestamptz;
-- A timestamp reveals nothing private; it lets pages know a photo exists and
-- busts caches when it changes.
grant select (photo_updated_at) on public.profiles to anon, authenticated;

create table private.profile_photos (
  profile_id uuid primary key references public.profiles(id) on update restrict on delete cascade,
  bytes bytea not null check (pg_catalog.octet_length(bytes) between 1 and 524288),
  updated_at timestamptz not null default pg_catalog.now()
);
revoke all on table private.profile_photos from public, anon, authenticated;

create function public.set_own_profile_photo(p_bytes bytea)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_id uuid; stamp timestamptz;
begin
  if p_bytes is null or pg_catalog.octet_length(p_bytes) not between 1 and 524288
    -- The server re-encodes every upload to WebP; refuse anything else.
    or pg_catalog.substr(p_bytes,1,4) <> '\x52494646'::bytea
    or pg_catalog.substr(p_bytes,9,4) <> '\x57454250'::bytea then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id into target_id from public.profiles p
    join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active for update of p;
  if not found or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  stamp := pg_catalog.clock_timestamp();
  insert into private.profile_photos(profile_id,bytes,updated_at)
    values(target_id,p_bytes,stamp)
    on conflict (profile_id) do update set bytes=excluded.bytes,updated_at=excluded.updated_at;
  update public.profiles set photo_updated_at=stamp where id=target_id;
  return pg_catalog.jsonb_build_object('ok',true,'updatedAt',stamp);
end;
$$;

create function public.remove_own_profile_photo()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_id uuid;
begin
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  select p.id into target_id from public.profiles p
    join public.memberships m on m.user_id=p.auth_user_id
    where p.auth_user_id=actor and p.active and m.active for update of p;
  if not found then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  delete from private.profile_photos where profile_id=target_id;
  update public.profiles set photo_updated_at=null where id=target_id;
  return '{"ok":true}'::jsonb;
end;
$$;

-- Public read: only for profiles that have an author page.
create function public.get_public_profile_photo(p_slug text)
returns table(bytes bytea, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ph.bytes,ph.updated_at from public.profiles p
    join private.profile_photos ph on ph.profile_id=p.id
    where p.slug=p_slug and p.active and p.auth_user_id is not null;
$$;

revoke all on function public.set_own_profile_photo(bytea),
  public.remove_own_profile_photo(), public.get_public_profile_photo(text)
  from public, anon, authenticated;
grant execute on function public.set_own_profile_photo(bytea),
  public.remove_own_profile_photo() to authenticated;
grant execute on function public.get_public_profile_photo(text) to anon, authenticated;
