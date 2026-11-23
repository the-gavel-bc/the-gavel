begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc

create function pg_temp.simulate_editorial_retry() returns trigger language plpgsql as $$
begin
  if new.correlation_id='82000000-0000-0000-0000-000000000001' then
    raise exception 'Synthetic deadlock' using errcode='40P01';
  elsif new.correlation_id='82000000-0000-0000-0000-000000000002' then
    raise exception 'Synthetic serialization conflict' using errcode='40001';
  end if;
  return new;
end;
$$;

create temp table retry_article as
select (public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'articleId')::uuid id;
grant select on retry_article to authenticated;

create trigger simulate_editorial_retry before insert on public.audit_events
for each row execute function pg_temp.simulate_editorial_retry();

set local role authenticated;
select is(public.create_article_draft('82000000-0000-0000-0000-000000000001',
  pg_temp.draft_input('{"title":"Retryable Create"}'))->>'code','retryable','deadlock after draft insertion is retryable');
select is(public.save_article_draft((select id from retry_article),1,'82000000-0000-0000-0000-000000000002',
  pg_temp.draft_input('{"title":"Retryable Save"}'))->>'code','retryable','serialization failure after draft update is retryable');
reset role;

select is_empty($$select 1 from public.articles where title in ('Retryable Create','Retryable Save')$$,
  'failed writes leave neither article change behind');
select is((select edit_version from public.articles where id=(select id from retry_article)),1,
  'the prior draft version is preserved');
select is_empty($$select 1 from private.draft_write_receipts where request_id in
  ('82000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002')$$,
  'retryable failures do not commit receipts');

drop trigger simulate_editorial_retry on public.audit_events;
set local role authenticated;
select is(public.save_article_draft((select id from retry_article),1,'82000000-0000-0000-0000-000000000002',
  pg_temp.draft_input('{"title":"Retryable Save"}'))->>'version','2','retry succeeds with the same UUID and payload');
select is(public.save_article_draft((select id from retry_article),1,'82000000-0000-0000-0000-000000000002',
  pg_temp.draft_input('{"title":"Retryable Save"}'))->>'replayed','true','later replays still return the committed receipt');
reset role;
select * from finish();
rollback;
