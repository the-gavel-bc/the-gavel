-- A short transaction-local suffix keeps synthetic names outside the existing catalog.
select set_config('gavel.review_fixture_token',left(replace(gen_random_uuid()::text,'-',''),12),true);
create function pg_temp.review_fixture_token() returns text
language sql stable as $$select current_setting('gavel.review_fixture_token')$$;
grant execute on function pg_temp.review_fixture_token() to authenticated, anon;
