begin;
select no_plan();

select is_empty($$
  select n.nspname, c.relname from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
    and not c.relrowsecurity
$$, 'Every application table enables row-level security');

select is_empty($$
  select p.oid::regprocedure from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)
$$, 'Application security definers use an empty search path');

select set_eq($$
  select p.oid from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and has_schema_privilege('anon', n.oid, 'USAGE')
    and has_function_privilege('anon', p.oid, 'EXECUTE')
$$, $$
  select to_regprocedure(signature)::oid from unnest(array[
    'public.get_public_article(text)',
    'public.get_public_article_media(uuid,uuid)',
    'public.get_public_homepage()',
    'public.get_public_profile_photo(text)',
    'public.get_public_read_this()',
    'public.get_public_site_navigation()',
    'public.list_public_articles(text,text,text,integer,jsonb)',
    'public.list_public_sitemap_articles(timestamp with time zone,uuid,integer)',
    'public.search_public_articles(text,integer,jsonb)',
    'public.suggest_public_articles(text)'
  ]) signature
$$, 'Only reviewed public RPC signatures are callable by anonymous readers');

select is_empty($$
  select n.nspname, c.relname from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and case when c.relkind in ('r', 'p', 'v', 'm', 'f') then
      has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      or has_any_column_privilege('anon', c.oid, 'INSERT,UPDATE,REFERENCES')
    when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'USAGE,UPDATE')
    else false end
$$, 'Anonymous readers have no write grants on application relations');

select hasnt_function('public', 'record_media_cleanup_health', array['boolean']);
select hasnt_function('public', 'register_retired_media_key', array['uuid','uuid','uuid']);
select hasnt_function('public', 'finish_retired_article_scan', array['uuid','uuid','integer','boolean']);

-- Test effective grants on newly created objects as the application migration owner.
create table public.catalog_grant_probe (id integer);
create table private.catalog_grant_probe (id integer);
create sequence public.catalog_grant_probe_seq;
create sequence private.catalog_grant_probe_seq;
create function public.catalog_grant_probe() returns integer language sql set search_path = '' as 'select 1';
create function private.catalog_grant_probe() returns integer language sql set search_path = '' as 'select 1';

select is_empty($$
  select role_name, schema_name from unnest(array['anon','authenticated']) role_name
  cross join unnest(array['public','private']) schema_name
  where has_table_privilege(role_name, schema_name || '.catalog_grant_probe',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_sequence_privilege(role_name, schema_name || '.catalog_grant_probe_seq', 'USAGE,SELECT,UPDATE')
    or has_function_privilege(role_name, schema_name || '.catalog_grant_probe()', 'EXECUTE')
$$, 'New application objects grant neither anonymous nor authenticated access by default');

select * from finish();
rollback;
