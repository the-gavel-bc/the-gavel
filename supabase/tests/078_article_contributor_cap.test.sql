begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
insert into public.profiles(id,display_name,slug)
select ('78000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'Contributor cap fixture '||n,'contributor-cap-fixture-'||n
from generate_series(1,7) n;

create function pg_temp.cap_draft(n integer,p_title text) returns jsonb language sql as $$
  select pg_temp.draft_input(jsonb_build_object(
    'title',p_title,
    'content','{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Cap fixture body"}]}]}}'::jsonb,
    'contributors',coalesce((select jsonb_agg(jsonb_build_object(
      'profileId',('78000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
      'role','writer','displayOrder',i) order by i) from generate_series(1,n) i),'[]'::jsonb)
  ));
$$;
grant execute on function pg_temp.cap_draft(integer,text) to authenticated;
create temp table cap_fixture as
  select (public.create_article_draft(gen_random_uuid(),pg_temp.cap_draft(5,'Cap fixture'))->>'articleId')::uuid id;
grant select on cap_fixture to authenticated;
select ok((select id is not null from cap_fixture),'five credits may be created');

set local role authenticated;
select is(public.create_article_draft(gen_random_uuid(),pg_temp.cap_draft(6,'Six on create'))#>>'{fieldErrors,contributors}',
  'Choose up to 5 contributors.','new articles cannot start above five credits');
select is(public.save_article_draft((select id from cap_fixture),1,gen_random_uuid(),
  pg_temp.cap_draft(6,'Six from five'))#>>'{fieldErrors,contributors}','Choose up to 5 contributors.','a draft cannot exceed five credits');
reset role;
select is((select edit_version from public.articles where id=(select id from cap_fixture)),1,
  'the rejected increase does not change the stored version');

-- Simulate a draft committed before the product cap.
insert into public.article_contributors(article_id,profile_id,contribution_role,display_order)
select id,'78000000-0000-0000-0000-000000000006','writer',6 from cap_fixture on conflict do nothing;
insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,
  expected_version,payload_hash,result_version,result_updated_at,changed)
select '00000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000015',
  'create',id,null,private.draft_request_hash('create',null,null,
    private.check_draft_input(pg_temp.cap_draft(6,'Cap fixture'))->'value'),1,
  (select updated_at from public.articles where id=cap_fixture.id),true from cap_fixture;
set local role authenticated;
select is(public.create_article_draft('78000000-0000-0000-0000-000000000015',
  pg_temp.cap_draft(6,'Cap fixture'))->>'replayed','true','a legacy creation with six credits can still replay');
select is(public.save_article_draft((select id from cap_fixture),1,gen_random_uuid(),
  pg_temp.cap_draft(7,'Seven from six'))#>>'{fieldErrors,contributors}','Choose up to 6 contributors.','a legacy draft cannot increase its count');
select is(public.save_article_draft((select id from cap_fixture),1,'78000000-0000-0000-0000-000000000014',
  pg_temp.cap_draft(6,'Legacy title edit'))->>'ok','true','a legacy draft can keep six credits on save');
select is(public.save_article_draft((select id from cap_fixture),2,gen_random_uuid(),
  pg_temp.cap_draft(5,'Reduce to five'))->>'ok','true','a legacy draft can reduce its count');
select is(public.save_article_draft((select id from cap_fixture),3,gen_random_uuid(),
  pg_temp.cap_draft(6,'Try six again'))#>>'{fieldErrors,contributors}','Choose up to 5 contributors.','a reduced draft cannot grow back above five');
select is(public.save_article_draft((select id from cap_fixture),1,'78000000-0000-0000-0000-000000000014',
  pg_temp.cap_draft(6,'Legacy title edit'))->>'replayed','true','the old six-credit receipt still replays');
reset role;

-- Recreate an older published article with six credits and a finalized main image.
insert into public.article_contributors(article_id,profile_id,contribution_role,display_order)
select id,'78000000-0000-0000-0000-000000000006','writer',6 from cap_fixture on conflict do nothing;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at)
select '78000000-0000-0000-0000-000000000021',id,'00000000-0000-0000-0000-000000000002',gen_random_uuid(),
  'contributor-cap/photo.webp','finalized',1234,120,90,repeat('f',64),now() from cap_fixture;
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select id,'78000000-0000-0000-0000-000000000021','Photo','Credit' from cap_fixture;
update public.articles set status='published',published_at=now() where id=(select id from cap_fixture);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(public.save_published_article((select id from cap_fixture),3,gen_random_uuid(),
  pg_temp.cap_draft(7,'Published increase'))#>>'{fieldErrors,contributors}','Choose up to 6 contributors.','a legacy publication cannot increase its count');
select is(public.save_published_article((select id from cap_fixture),3,'78000000-0000-0000-0000-000000000016',
  pg_temp.cap_draft(6,'Published title edit'))->>'ok','true','a legacy publication can keep six credits');
select is(public.save_published_article((select id from cap_fixture),4,gen_random_uuid(),
  pg_temp.cap_draft(5,'Published reduction'))->>'ok','true','a legacy publication can reduce its count');
select is(public.save_published_article((select id from cap_fixture),5,gen_random_uuid(),
  pg_temp.cap_draft(6,'Published extra'))#>>'{fieldErrors,contributors}','Choose up to 5 contributors.','a reduced publication cannot grow back above five');
select is(public.save_published_article((select id from cap_fixture),3,'78000000-0000-0000-0000-000000000016',
  pg_temp.cap_draft(6,'Published title edit'))->>'replayed','true','an exact older published receipt can still replay');
reset role;

select is((select edit_version from public.articles where id=(select id from cap_fixture)),5,
  'published replay leaves the current version intact');
select is((select count(*)::int from public.article_contributors where article_id=(select id from cap_fixture)),5,
  'published replay leaves the reduced count intact');
select * from finish();
rollback;
