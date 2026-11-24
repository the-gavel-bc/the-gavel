-- An administrator can set one image for the public About page. Like profile
-- photos, the server re-encodes the upload to WebP and the bytes live in a
-- private table that is only readable through the functions below.
create table private.site_about_image (
  singleton boolean primary key default true check (singleton),
  bytes bytea not null check (pg_catalog.octet_length(bytes) between 1 and 1048576),
  alt text not null check (pg_catalog.char_length(alt) between 1 and 240
    and alt !~ '[<>]' and alt !~ '[[:cntrl:]]'),
  updated_at timestamptz not null default pg_catalog.now()
);
alter table private.site_about_image enable row level security;
revoke all on table private.site_about_image from public, anon, authenticated;

-- Keep every action other migrations allowed; add the image change.
do $$ declare previous_expression text; begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into strict previous_expression
    from pg_catalog.pg_constraint where conrelid='public.audit_events'::regclass
      and conname='audit_events_action_resource_check';
  alter table public.audit_events drop constraint audit_events_action_resource_check;
  execute pg_catalog.format('alter table public.audit_events add constraint audit_events_action_resource_check check ((%s) or (resource_type = %L and action = %L)) not valid',
    previous_expression,'site_information','site_information.image_changed');
  alter table public.audit_events validate constraint audit_events_action_resource_check;
end $$;

create function public.set_site_about_image(p_bytes bytea, p_alt text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if p_bytes is null or pg_catalog.octet_length(p_bytes) not between 1 and 1048576
    or pg_catalog.substr(p_bytes,1,4) <> '\x52494646'::bytea
    or pg_catalog.substr(p_bytes,9,4) <> '\x57454250'::bytea
    or p_alt is null or pg_catalog.char_length(p_alt) not between 1 and 240
    or p_alt ~ '[<>]' or p_alt ~ '[[:cntrl:]]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  -- Same lock as the other site information writes.
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  insert into private.site_about_image(bytes,alt,updated_at)
    values(p_bytes,p_alt,pg_catalog.clock_timestamp())
    on conflict (singleton) do update
      set bytes=excluded.bytes,alt=excluded.alt,updated_at=excluded.updated_at;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
    values(actor,'site_information.image_changed','site_information',
      '00000000-0000-0000-0000-000000000002'::uuid,pg_catalog.gen_random_uuid());
  return '{"ok":true}'::jsonb;
end;
$$;

create function public.remove_site_about_image()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); removed integer;
begin
  if actor is null or not private.has_eligible_identity() then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(72300320261107::bigint);
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=actor and p.active) then
    return '{"ok":false,"code":"forbidden"}'::jsonb;
  end if;
  delete from private.site_about_image;
  get diagnostics removed = row_count;
  if removed > 0 then
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'site_information.image_changed','site_information',
        '00000000-0000-0000-0000-000000000002'::uuid,pg_catalog.gen_random_uuid());
  end if;
  return '{"ok":true}'::jsonb;
end;
$$;

-- Public reads. Metadata lets pages decide whether to show the image and
-- busts caches when it changes; the bytes are served by a separate route.
create function public.get_public_site_about_image_meta()
returns table(alt text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.alt,i.updated_at from private.site_about_image i;
$$;
create function public.get_public_site_about_image()
returns table(bytes bytea)
language sql stable security definer set search_path = '' as $$
  select i.bytes from private.site_about_image i;
$$;

revoke all on function public.set_site_about_image(bytea,text),
  public.remove_site_about_image(), public.get_public_site_about_image_meta(),
  public.get_public_site_about_image() from public, anon, authenticated;
grant execute on function public.set_site_about_image(bytea,text),
  public.remove_site_about_image() to authenticated;
grant execute on function public.get_public_site_about_image_meta(),
  public.get_public_site_about_image() to anon, authenticated;
