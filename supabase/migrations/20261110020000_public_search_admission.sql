create function private.normalize_search_query(p_query text) returns text
language plpgsql immutable set search_path='' as $$
declare q text;
begin
  if p_query is null or char_length(p_query)>512 or octet_length(p_query)>2048 then return null; end if;
  q:=btrim(regexp_replace(p_query,U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g'));
  if char_length(q) not between 1 and 160 or q~U&'[\0001-\001F\007F-\009F]' then return null; end if;
  return q;
end;
$$;

-- 128 slots encode a server minute and at most 120 accepted attempts. Sequence
-- changes deliberately survive rollback/cancellation; no source row is written.
create sequence private.public_search_budget as bigint minvalue 0 start with 0 increment by 1 cache 1 no cycle;
create function private.claim_public_search_budget() returns integer
language plpgsql volatile set search_path='' as $$
declare base bigint; used bigint; now_at timestamptz; retry integer;
begin
  -- Two-int advisory namespace is separate from existing one-bigint article locks.
  -- Transaction ownership avoids leaking session locks when requests are aborted.
  perform pg_catalog.pg_advisory_xact_lock(1617,1);
  now_at:=clock_timestamp();
  base:=floor(extract(epoch from now_at)/60)::bigint*128;
  select last_value into used from private.public_search_budget;
  if used<base then perform pg_catalog.setval('private.public_search_budget'::regclass,base,true); used:=base; end if;
  if used>=base+120 then
    retry:=greatest(1,least(60,ceil(extract(epoch from(to_timestamp((used/128+1)*60)-now_at)))))::integer;
    return retry;
  end if;
  perform pg_catalog.nextval('private.public_search_budget'::regclass);
  return 0;
end;
$$;
revoke all on sequence private.public_search_budget from public,anon,authenticated,service_role;
revoke all on function private.normalize_search_query(text),private.claim_public_search_budget() from public,anon,authenticated,service_role;
