begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
\ir support/review-fixtures/review-fixtures.inc

create temp table moderation_fixture as
select gen_random_uuid() user_id,'moderation-'||pg_temp.review_fixture_token() slug;
grant select on moderation_fixture to authenticated,anon;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
select user_id,slug||'@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb from moderation_fixture;
insert into public.profiles(id,auth_user_id,display_name,slug,biography)
select user_id,user_id,'Synthetic Member',slug,'Synthetic biography' from moderation_fixture;
insert into public.memberships(user_id,role,active,approved_by,approved_at)
select user_id,'author',true,'00000000-0000-0000-0000-000000000004',now() from moderation_fixture;

select set_config('request.jwt.claim.sub',(select user_id::text from moderation_fixture),true);
create temp table moderation_article as
select (public.create_article_draft(gen_random_uuid(),pg_temp.draft_input(jsonb_build_object('content',
  '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Moderation fixture."}]}]}}'::jsonb)))->>'articleId')::uuid id;
update public.articles set status='published',published_at=now() where id=(select id from moderation_article);
alter table moderation_article add column slug text;
update moderation_article f set slug=a.slug from public.articles a where a.id=f.id;
grant select on moderation_article to anon,authenticated;

select has_function('public','moderate_member_profile',array['uuid','integer','uuid','boolean','boolean','boolean']);
set local role authenticated;
select is(public.moderate_member_profile((select user_id from moderation_fixture),1,gen_random_uuid(),
  true,true,true)->>'code','forbidden','an author cannot moderate their own profile');
reset role;

set local role anon;
select is((select count(*) from public.profiles where slug=(select slug from moderation_fixture)),1::bigint,
  'an active member profile is public before moderation');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(public.moderate_member_profile((select user_id from moderation_fixture),1,
  '85000000-0000-0000-0000-000000000001',true,true,true)->>'version','2','active administrator can moderate');
select is(public.moderate_member_profile((select user_id from moderation_fixture),1,
  '85000000-0000-0000-0000-000000000001',true,true,true)->>'replayed','true','exact retry is idempotent');
reset role;
select ok(exists(select 1 from public.profiles p join moderation_fixture f on f.user_id=p.id
  where p.biography is null and p.display_name='Gavel contributor' and p.active),
  'moderation resets public fields while retaining profile identity and status');

set local role anon;
select is((select count(*) from public.profiles where slug=(select slug from moderation_fixture)),0::bigint,
  'RLS hides the public profile');
select is(public.get_public_article((select slug from moderation_article))->'article'->'owner'->>'displayName',
  'Gavel contributor','the article stays available with a plain-text byline');
select is(public.get_public_article((select slug from moderation_article))->'article'->'owner'->>'slug',null,
  'public articles omit hidden author links');
select is(jsonb_array_length(public.list_public_articles('author',(select slug from moderation_fixture),null,10,null)->'items'),0,
  'the list RPC cannot be used as an alternative hidden-author archive');
reset role;
update public.profiles set public_page_hidden=false where id=(select user_id from moderation_fixture);
update public.memberships set active=false,revoked_at=now() where user_id=(select user_id from moderation_fixture);
set local role anon;
select is((select count(*) from public.profiles where slug=(select slug from moderation_fixture)),0::bigint,
  'membership deactivation hides a profile independent of moderation');
reset role;

select * from finish();
rollback;
