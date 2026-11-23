begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
\ir support/review-fixtures/review-fixtures.inc

create temp table erasure_actor as
select gen_random_uuid() id,'erase-'||pg_temp.review_fixture_token() slug;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
select id,slug||'@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb from erasure_actor;
insert into public.profiles(id,auth_user_id,display_name,slug,biography)
select id,id,'Private fixture name',slug,'Private biography' from erasure_actor;
insert into public.memberships(user_id,role,active,approved_by,approved_at)
select id,'author',true,'00000000-0000-0000-0000-000000000004',now() from erasure_actor;
select set_config('request.jwt.claim.sub',(select id::text from erasure_actor),true);
create temp table erasure_article as
select (public.create_article_draft('87000000-0000-0000-0000-000000000001',pg_temp.draft_input())->>'articleId')::uuid id;

create temp table erasure_guest as
select (public.create_guest_contributor(gen_random_uuid(),'Erased member guest fixture')->>'id')::uuid id;
update public.profiles set created_at=now()-interval '31 days' where id=(select id from erasure_guest);

select throws_ok($$update public.audit_events set actor_user_id=null where correlation_id='87000000-0000-0000-0000-000000000001'$$,
  '55000','Audit events are immutable.','owner cannot null an actor manually');
select throws_ok($$delete from public.audit_events where correlation_id='87000000-0000-0000-0000-000000000001'$$,
  '55000','Audit events are immutable.','owner cannot delete an event');
select throws_ok($$truncate public.audit_events$$,'55000','Audit events are immutable.','owner cannot truncate event history');
select ok(not has_table_privilege('service_role','public.audit_events','UPDATE'),'service role lacks update grants');
select ok(not has_table_privilege('service_role','public.audit_events','DELETE'),'service role lacks delete grants');
select ok(not has_table_privilege('service_role','public.audit_events','TRUNCATE'),'service role lacks truncate grants');

select lives_ok($$delete from auth.users where id=(select id from erasure_actor)$$,
  'the synthetic Auth account erases in one transaction');
select is((select actor_user_id::text from public.audit_events where correlation_id='87000000-0000-0000-0000-000000000001'),
  null,'audit actor reference is nulled without losing the event');
select ok(exists(select 1 from public.article_revisions r join erasure_article a on a.id=r.article_id
  where r.actor_user_id is null and r.snapshot->'article'->>'title'='Synthetic Draft'),
  'revision remains with its original snapshot and no actor');
select ok(exists(select 1 from public.articles a join erasure_article f on a.id=f.id
  join public.profiles p on p.id=a.owner_profile_id where p.auth_user_id is null
    and p.biography is null and p.display_name='Gavel contributor' and p.public_page_hidden
    and p.slug like 'erased-%' and p.id=(select id from erasure_actor)),
  'article keeps its anonymized owner row and no profile biography');
select is_empty($$select 1 from private.draft_write_receipts where request_id='87000000-0000-0000-0000-000000000001'$$,
  'actor receipts are removed');
select is_empty($$select 1 from private.draft_write_limits where actor_user_id=(select id from erasure_actor)$$,
  'actor limits are removed');

select ok(exists(select 1 from private.guest_credit_provenance where profile_id=(select id from erasure_guest)),
  'the one-off creation marker remains after personal receipts cascade');
set local role service_role;
select is(public.sweep_orphan_guest_credits(100)->>'deleted','1','erasure does not strand an old one-off credit');
reset role;

update public.memberships set active=false,revoked_at=now()
where role='administrator' and user_id<>'00000000-0000-0000-0000-000000000004';
select throws_ok($$delete from auth.users where id='00000000-0000-0000-0000-000000000004'$$,
  '55000','Cannot erase the last eligible administrator.','erasure preserves the last eligible administrator');

select * from finish();
rollback;
