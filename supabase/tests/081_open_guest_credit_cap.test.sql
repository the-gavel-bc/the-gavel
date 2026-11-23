begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
\ir support/review-fixtures/review-fixtures.inc

create temp table cap_members as
select gen_random_uuid() id, name,
  'cap-member-'||pg_temp.review_fixture_token()||'-'||name as slug
from (values ('owner'),('other')) fixture(name);
grant select on cap_members to authenticated;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
select id,slug||'@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb from cap_members;
insert into public.profiles(auth_user_id,display_name,slug)
select id,'Synthetic '||name,slug from cap_members;
insert into public.memberships(user_id,role,active,approved_by,approved_at)
select id,'author',true,'00000000-0000-0000-0000-000000000004',now() from cap_members;
select set_config('request.jwt.claim.sub',(select id::text from cap_members where name='owner'),true);

create temp table prior_guest_credits as
select gen_random_uuid() id,gen_random_uuid() request_id,
  'Legacy credit '||pg_temp.review_fixture_token()||' '||n as name,
  'legacy-credit-'||pg_temp.review_fixture_token()||'-'||n as slug
from generate_series(1,49) n;
insert into public.profiles(id,display_name,slug)
select id,name,slug from prior_guest_credits;
insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
select auth.uid(),request_id,'create_guest_author',id,
  private.membership_payload_hash(jsonb_build_object('operation','create_guest_author','displayName',name)),
  jsonb_build_object('ok',true,'id',id,'displayName',name,'slug',slug,'created',true,'replayed',false)
from prior_guest_credits;
-- The older guest RPC persisted additional receipts when it reused an existing
-- credit. A reuse receipt does not represent a second allocation.
insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
select auth.uid(),gen_random_uuid(),'create_guest_author',id,
  private.membership_payload_hash(jsonb_build_object('operation','create_guest_author','displayName',name)),
  jsonb_build_object('ok',true,'id',id,'displayName',name,'slug',slug,'created',false,'replayed',false)
from prior_guest_credits order by id limit 1;
create temp table credit_cap_article as
select (public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'articleId')::uuid id;
-- A historical reference is preserved but does not occupy a current article slot.
insert into public.article_revisions(article_id,actor_user_id,snapshot)
select a.id,auth.uid(),jsonb_build_object('contributors',jsonb_build_array(
  jsonb_build_object('profileId',c.id,'role','writer','displayOrder',0)))
from credit_cap_article a cross join (select id from prior_guest_credits order by id limit 1) c;
grant select on credit_cap_article to authenticated;
grant select on prior_guest_credits to authenticated;

set local role authenticated;
select is(public.create_guest_contributor('81000000-0000-0000-0000-000000000001',
  'New open credit '||pg_temp.review_fixture_token())->>'created','true','the fiftieth open credit is admitted');
select is(public.create_guest_contributor('81000000-0000-0000-0000-000000000001',
  'New open credit '||pg_temp.review_fixture_token())->>'replayed','true','a full cap still allows exact replay');
select is(public.create_guest_contributor('81000000-0000-0000-0000-000000000001',
  'Different credit '||pg_temp.review_fixture_token())->>'code','request_conflict','a changed request still conflicts');
select is(public.create_guest_contributor('81000000-0000-0000-0000-000000000003',
  'Over credit cap '||pg_temp.review_fixture_token())->>'code','conflict','a new open credit above fifty is refused');
reset role;
select is_empty($$select 1 from public.profiles where display_name='Over credit cap '||pg_temp.review_fixture_token()$$,
  'the cap does not insert a guest profile');
select is_empty($$select 1 from public.audit_events
  where correlation_id='81000000-0000-0000-0000-000000000003'$$,
  'the capped request creates no audit event');

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from cap_members where name='other'),true);
select is(public.create_guest_contributor(gen_random_uuid(),
  'Independent credit '||pg_temp.review_fixture_token())->>'created','true','another active member can create their own credit');

select set_config('request.jwt.claim.sub',(select id::text from cap_members where name='owner'),true);
select is(public.save_article_draft((select id from credit_cap_article),1,gen_random_uuid(),
  pg_temp.draft_input(jsonb_build_object('contributors',(
    select jsonb_build_array(jsonb_build_object('profileId',id,'role','writer','displayOrder',0))
    from prior_guest_credits order by id limit 1
  ))))->>'ok','true','a member can attach an existing unused credit');
select is(public.create_guest_contributor(gen_random_uuid(),
  'Newly freed slot '||pg_temp.review_fixture_token())->>'created','true','attaching a credit frees a slot');
select is(public.create_guest_contributor(gen_random_uuid(),
  'Over again '||pg_temp.review_fixture_token())->>'code','conflict','the cap applies again after the slot is filled');
reset role;
select * from finish();
rollback;
