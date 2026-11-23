-- First-time tag inserts use an Eastern-calendar daily quota per active member.
create table private.member_tag_creation_limits (
  actor_user_id uuid primary key references auth.users(id) on delete cascade,
  quota_day date not null,
  created_count integer not null check (created_count between 1 and 30)
);
alter table private.member_tag_creation_limits enable row level security;
revoke all on private.member_tag_creation_limits from public,anon,authenticated,service_role;

create function private.tag_creation_day(p_at timestamptz)
returns date language sql immutable strict set search_path = '' as $$
  select (p_at at time zone 'America/New_York')::date;
$$;
revoke all on function private.tag_creation_day(timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.ensure_tag(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_profile uuid;
  today date;
  normalized text;
  base text;
  candidate text;
  suffix text;
  n integer;
  tag public.tags%rowtype;
  created boolean := false;
begin
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if not private.consume_draft_attempt(actor) then
    return '{"ok":false,"code":"rate_limited"}'::jsonb;
  end if;
  normalized := trim(regexp_replace(p_name,U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'));
  if normalized is null or char_length(normalized) not between 1 and 120
    or normalized ~ U&'[\0001-\001F\007F-\009F]' then
    return '{"ok":false,"code":"invalid_input"}'::jsonb;
  end if;
  -- One lock covers overlapping slug bases, e.g. "topic" and "topic-2".
  -- A fresh SELECT after the wait sees a concurrent creator's committed row.
  perform pg_catalog.pg_advisory_xact_lock(72300320261112::bigint);
  select * into tag from public.tags where lower(name)=lower(normalized);
  if not found then
    -- The actor lock serializes the per-member debit and the tag lock keeps name reuse atomic.
    today := private.tag_creation_day(clock_timestamp());
    if exists(select 1 from private.member_tag_creation_limits l
      where l.actor_user_id=actor and l.quota_day=today and l.created_count>=30) then
      return '{"ok":false,"code":"conflict"}'::jsonb;
    end if;
    base := private.taxonomy_slug_base(normalized);
    for n in 1..10000 loop
      suffix := case when n=1 then '' else '-' || n::text end;
      candidate := trim(trailing '-' from left(base,120-char_length(suffix))) || suffix;
      if private.is_reserved_taxonomy_slug(candidate) then continue; end if;
      insert into public.tags(name,slug) values(normalized,candidate)
        on conflict do nothing returning * into tag;
      if found then
        insert into private.member_tag_creation_limits(actor_user_id,quota_day,created_count)
          values(actor,today,1)
          on conflict(actor_user_id) do update set
            quota_day=excluded.quota_day,
            created_count=case when member_tag_creation_limits.quota_day=excluded.quota_day
              then member_tag_creation_limits.created_count+1 else 1 end;
        created := true;
        exit;
      end if;
      select * into tag from public.tags where lower(name)=lower(normalized);
      if found then exit; end if;
    end loop;
  end if;
  if tag.id is null then return '{"ok":false,"code":"unavailable"}'::jsonb; end if;
  return jsonb_build_object('ok',true,'id',tag.id,'name',tag.name,'slug',tag.slug,'created',created);
end;
$$;
