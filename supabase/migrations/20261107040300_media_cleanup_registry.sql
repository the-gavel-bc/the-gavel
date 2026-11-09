-- The CLI does not implicitly wrap this migration; retain locks through backfill and trigger installation.
begin;
-- Atomic cutover: every live key is registered before guarded writes resume.
lock table public.media_assets in share row exclusive mode;
lock table public.articles in share row exclusive mode;
create table private.article_id_registry (article_id uuid primary key);
insert into private.article_id_registry(article_id) select id from public.articles;
insert into private.article_id_registry(article_id)
 select distinct article_id from private.article_deletion_receipts on conflict do nothing;
create table private.retired_article_ids (
 article_id uuid primary key references private.article_id_registry(article_id),
 last_attempt_at timestamptz, scan_offset integer not null default 0 check(scan_offset>=0),
 claim_token uuid, claim_until timestamptz
);
insert into private.retired_article_ids(article_id)
 select distinct article_id from private.article_deletion_receipts on conflict do nothing;
create table private.media_key_registry (
 object_key text primary key, asset_id uuid not null unique, article_id uuid not null,
 retired boolean not null default false
);
insert into private.media_key_registry(object_key,asset_id,article_id)
 select object_key,id,article_id from public.media_assets;
create table private.media_cleanup_ledger (
 object_key text primary key references private.media_key_registry(object_key),
 article_id uuid not null, asset_id uuid not null,
 last_attempt_at timestamptz, last_succeeded_at timestamptz,
 claim_token uuid, claim_until timestamptz
);
revoke all on private.article_id_registry,private.retired_article_ids,private.media_key_registry,private.media_cleanup_ledger from public,anon,authenticated;
create function private.register_article_id() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.article_id_registry(article_id) values(new.id);
 return new;
end $$;
create trigger register_article_id before insert on public.articles for each row execute function private.register_article_id();
create function private.register_media_key() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.object_key is distinct from old.object_key or new.id is distinct from old.id or new.article_id is distinct from old.article_id then
   raise exception 'Media key ownership is immutable' using errcode='23514'; end if;
  return new;
 end if;
 insert into private.media_key_registry(object_key,asset_id,article_id) values(new.object_key,new.id,new.article_id);
 return new;
end $$;
create trigger register_media_key before insert or update of object_key,id,article_id on public.media_assets
 for each row execute function private.register_media_key();
create function private.retire_media_key() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.media_key_registry set retired=true where object_key=old.object_key and asset_id=old.id and article_id=old.article_id;
 if not found then raise exception 'Missing media key registry entry' using errcode='23514'; end if;
 insert into private.media_cleanup_ledger(object_key,asset_id,article_id)
  values(old.object_key,old.id,old.article_id) on conflict(object_key) do nothing;
 return old;
end $$;
create trigger retire_media_key after delete on public.media_assets for each row execute function private.retire_media_key();
revoke all on function private.register_article_id(),private.register_media_key(),private.retire_media_key() from public,anon,authenticated;

commit;
