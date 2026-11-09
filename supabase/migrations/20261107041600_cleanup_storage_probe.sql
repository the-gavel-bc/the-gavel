-- One permanently reserved service-only probe key avoids generating unbounded ledger rows.
create table private.media_cleanup_probe (
 id boolean primary key default true check(id),
 object_key text not null unique,
 asset_id uuid not null unique,
 article_id uuid not null,
 armed boolean not null default false
);
insert into private.media_cleanup_probe(id,object_key,asset_id,article_id) values
 (true,'__gavel_cleanup_probe_7e8d07e2__/ae3b8315-8d05-4d30-8b39-e5f9b1d74865.webp',
 'ae3b8315-8d05-4d30-8b39-e5f9b1d74865','58494537-3b05-4550-92dc-31eab3cb0288');
insert into private.media_key_registry(object_key,asset_id,article_id,retired)
 select object_key,asset_id,article_id,true from private.media_cleanup_probe;
revoke all on private.media_cleanup_probe from public,anon,authenticated;
create function public.get_media_cleanup_probe(p_run_token uuid)
returns table(object_key text,armed boolean) language sql stable security definer set search_path='' as $$
 select p.object_key,p.armed from private.media_cleanup_probe p
 where exists(select 1 from private.media_cleanup_runtime r where r.id=true and r.run_token=p_run_token and r.run_until>=clock_timestamp());
$$;
create function public.arm_media_cleanup_probe(p_run_token uuid) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from private.media_cleanup_runtime r where r.id=true and r.run_token=p_run_token and r.run_until>=clock_timestamp() for update;
 if not found then return false; end if;
 update private.media_cleanup_probe set armed=true where id=true;
 insert into private.media_cleanup_ledger(object_key,asset_id,article_id)
  select object_key,asset_id,article_id from private.media_cleanup_probe where id=true on conflict do nothing;
 return true;
end $$;
revoke all on function public.get_media_cleanup_probe(uuid),public.arm_media_cleanup_probe(uuid) from public,anon,authenticated;
grant execute on function public.get_media_cleanup_probe(uuid),public.arm_media_cleanup_probe(uuid) to service_role;
