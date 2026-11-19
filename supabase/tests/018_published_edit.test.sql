begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
-- Publishing and editing published articles are editor/administrator powers; these cases act as an administrator.
update public.memberships set role='administrator' where user_id='00000000-0000-0000-0000-000000000002';

create function pg_temp.published_input(p_patch jsonb default '{}') returns jsonb language sql as $$
select pg_temp.draft_input(jsonb_build_object('content','{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ready story"}]}]}}'::jsonb) || p_patch);
$$;
create temp table published_target as select
  (public.create_article_draft('80000000-0000-0000-0000-000000000801',pg_temp.published_input())->>'articleId')::uuid article_id;
grant select on published_target to authenticated;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
  byte_size,width,height,sha256,finalized_at)
select '60000000-0000-0000-0000-000000000801',article_id,
  '00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000802',
  'published/801.webp','finalized',1234,120,90,repeat('a',64),now() from published_target;
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000000801','Newsroom','The Gavel' from published_target;
update public.articles set status='published',published_at='2026-10-30 12:00:00+00'
  where id=(select article_id from published_target);
create temp table published_before as select slug,published_at from public.articles
  where id=(select article_id from published_target);
create function pg_temp.save_published(v integer,r uuid,patch jsonb default '{}') returns jsonb language sql as $$
select public.save_published_article((select article_id from published_target),v,r,pg_temp.published_input(patch));
$$;

select has_function('public','save_published_article',array['uuid','integer','uuid','jsonb'],
  'separate published save boundary exists');
select ok(not has_function_privilege('anon','public.save_published_article(uuid,integer,uuid,jsonb)','EXECUTE'),
  'anonymous cannot call published save');
create temp table outcomes(label text primary key,result jsonb);
grant select,insert on outcomes to authenticated;
set local role authenticated;
insert into outcomes values('owner',pg_temp.save_published(1,'80000000-0000-0000-0000-000000000803','{"title":"Updated Published"}'));
insert into outcomes values('retry',pg_temp.save_published(1,'80000000-0000-0000-0000-000000000803','{"title":"Updated Published"}'));
insert into outcomes values('reuse',pg_temp.save_published(1,'80000000-0000-0000-0000-000000000803','{"title":"Different Payload"}'));
insert into outcomes values('noop',pg_temp.save_published(2,'80000000-0000-0000-0000-000000000804','{"title":"Updated Published"}'));
insert into outcomes values('stale',pg_temp.save_published(1,gen_random_uuid(),'{"title":"Stale"}'));
insert into outcomes values('forged',pg_temp.save_published(2,gen_random_uuid(),'{"status":"draft"}'));
insert into outcomes values('empty',pg_temp.save_published(2,gen_random_uuid(),'{"content":null}'));
insert into outcomes values('inactive_section',pg_temp.save_published(2,gen_random_uuid(),
  '{"sectionId":"20000000-0000-0000-0000-000000000052"}'));
insert into outcomes values('inactive_category',pg_temp.save_published(2,gen_random_uuid(),
  '{"categoryIds":["30000000-0000-0000-0000-000000000053"]}'));
reset role;
select is((select result->>'ok' from outcomes where label='owner'),'true','owner edits published article');
select is((select result->>'version' from outcomes where label='owner'),'2','changed edit advances one version');
select is((select result->>'replayed' from outcomes where label='retry'),'true','exact retry replays');
select is((select result->>'code' from outcomes where label='reuse'),'request_conflict','different payload cannot reuse request ID');
select is((select result->>'changed' from outcomes where label='noop'),'false','semantic no-op is explicit');
select is((select result->>'version' from outcomes where label='noop'),'2','no-op keeps version');
select is((select result->>'code' from outcomes where label='stale'),'conflict','stale edit rejected');
select is((select result->>'code' from outcomes where label='forged'),'invalid_input','forged status rejected');
select is((select result->>'code' from outcomes where label='empty'),'invalid_input','empty published body rejected');
select is((select result->>'code' from outcomes where label='inactive_section'),'invalid_input','inactive section rejected');
select is((select result->>'code' from outcomes where label='inactive_category'),'invalid_input','inactive category rejected');
select is((select slug from public.articles),(select slug from published_before),'published slug remains fixed');
select is((select published_at from public.articles),(select published_at from published_before),'first publication time remains fixed');
select is((select status::text from public.articles),'published','ordinary edit preserves published status');
select is((select count(*)::integer from public.article_revisions),2,'one changed edit adds one revision');
select is((select count(*)::integer from public.audit_events where action='article.updated'),1,'one changed edit adds one audit event');
select is((select title from public.articles),'Updated Published','rejected edits preserve saved content');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
set local role authenticated;
insert into outcomes values('other',pg_temp.save_published(2,gen_random_uuid(),'{"title":"Foreign"}'));
reset role;
select is((select result->>'code' from outcomes where label='other'),'not_found','other author cannot edit');
insert into public.article_contributors(article_id,profile_id,contribution_role)
  select article_id,'10000000-0000-0000-0000-000000000003','writer' from published_target;
set local role authenticated;
insert into outcomes values('credited',pg_temp.save_published(2,gen_random_uuid(),'{"title":"Credited"}'));
reset role;
select is((select result->>'code' from outcomes where label='credited'),'not_found','credit grants no edit right');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
insert into outcomes values('admin',pg_temp.save_published(2,gen_random_uuid(),'{"title":"Administrator Edit"}'));
reset role;
select is((select result->>'ok' from outcomes where label='admin'),'true','administrator edits published article');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
insert into outcomes values('inactive',pg_temp.save_published(3,gen_random_uuid(),'{"title":"Inactive"}'));
reset role;
select is((select result->>'code' from outcomes where label='inactive'),'forbidden','inactive member cannot edit');
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000002';
delete from public.article_main_images where article_id=(select article_id from published_target);
set local role authenticated;
insert into outcomes values('no_image',pg_temp.save_published(3,gen_random_uuid(),'{"title":"Missing Image"}'));
reset role;
select is((select result->>'code' from outcomes where label='no_image'),'invalid_input','changed published edit requires main image');
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
select article_id,'60000000-0000-0000-0000-000000000801','Newsroom','The Gavel' from published_target;
create temp table saved_body as select content from public.articles where id=(select article_id from published_target);
update public.articles set content='{"legacy":true}'::jsonb where id=(select article_id from published_target);
set local role authenticated;
insert into outcomes values('unsupported',pg_temp.save_published(3,gen_random_uuid(),'{"title":"Legacy"}'));
reset role;
select is((select result->>'code' from outcomes where label='unsupported'),'unsupported_content','unsupported stored body is preserved');
update public.articles set content=(select content from saved_body) where id=(select article_id from published_target);
select is(pg_temp.save_published(1,'80000000-0000-0000-0000-000000000803','{"title":"Updated Published"}')->>'version',
  '2','old exact replay survives a later administrator edit');
select is((select title from public.articles),'Administrator Edit','old replay never reapplies content');
update public.articles set status='archived',archived_at=now() where id=(select article_id from published_target);
set local role authenticated;
insert into outcomes values('archived',pg_temp.save_published(3,gen_random_uuid(),'{"title":"No Archived Edit"}'));
reset role;
select is((select result->>'code' from outcomes where label='archived'),'conflict','archived article stays read only');
select * from finish();
rollback;
