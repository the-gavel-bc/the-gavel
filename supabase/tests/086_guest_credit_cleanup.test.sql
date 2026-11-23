begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
\ir support/review-fixtures/review-fixtures.inc

create temp table orphan_fixture as
select label,gen_random_uuid() id,gen_random_uuid() request_id,
  'orphan-'||label||'-'||pg_temp.review_fixture_token() slug
from (values('eligible'),('history'),('linked'),('recent'),('reused'),('frozen')) items(label);
grant select on orphan_fixture to authenticated,service_role;
insert into public.profiles(id,display_name,slug,created_at,slug_frozen)
select id,slug,slug,now()-case when label='recent' then interval '29 days' else interval '31 days' end,label='frozen'
from orphan_fixture;
insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result,created_at)
select auth.uid(),request_id,'create_guest_author',id,
  private.membership_payload_hash(jsonb_build_object('operation','create_guest_author','displayName',slug)),
  jsonb_build_object('ok',true,'id',id,'displayName',slug,'slug',slug,'created',label<>'reused','replayed',false),
  now()-interval '31 days'
from orphan_fixture;
insert into private.guest_credit_provenance(profile_id)
select id from orphan_fixture where label<>'reused';
create temp table orphan_article as
select (public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'articleId')::uuid id;
insert into public.article_revisions(article_id,actor_user_id,snapshot)
select a.id,auth.uid(),jsonb_build_object('contributors',jsonb_build_array(jsonb_build_object('profileId',f.id)))
from orphan_article a cross join orphan_fixture f where f.label='history';
insert into public.article_contributors(article_id,profile_id,contribution_role)
select a.id,f.id,'writer' from orphan_article a cross join orphan_fixture f where f.label='linked';

select has_function('public','sweep_orphan_guest_credits',array['integer']);
select ok(not has_function_privilege('anon','public.sweep_orphan_guest_credits(integer)','execute'),'anonymous denial');
select ok(not has_function_privilege('authenticated','public.sweep_orphan_guest_credits(integer)','execute'),'active member denial');

set local role service_role;
select is(public.sweep_orphan_guest_credits(0)->>'ok','false','invalid batch size deletes nothing');
select is(public.sweep_orphan_guest_credits(100)->>'deleted','1','only the old never-attached credit is removed');
select is(public.sweep_orphan_guest_credits(100)->>'deleted','0','a repeated sweep is harmless');
reset role;
select results_eq(
  $$select f.label from orphan_fixture f join public.profiles p using(id) order by f.label$$,
  $$values ('frozen'),('history'),('linked'),('recent'),('reused')$$,
  'current, historical, recent, legacy-reused and frozen profiles survive');
select is((select count(*) from private.profile_write_receipts where profile_id=(select id from orphan_fixture where label='eligible')),
  1::bigint,'the creation receipt remains as a retry record');

set local role authenticated;
select is((select public.create_guest_contributor(request_id,slug)->>'code' from orphan_fixture where label='eligible'),
  'expired','a replay never returns a deleted profile as a successful credit');
select is((select public.create_guest_contributor(request_id,'Changed name')->>'code' from orphan_fixture where label='eligible'),
  'request_conflict','a changed request does not reuse the expired receipt');
reset role;
select * from finish();
rollback;
