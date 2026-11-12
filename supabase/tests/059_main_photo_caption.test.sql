begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
select ok(not has_function_privilege('anon','public.set_article_main_image(uuid,integer,uuid,uuid,text,text,text)','execute'),'anonymous caption writes denied');
select ok(has_function_privilege('authenticated','public.set_article_main_image(uuid,integer,uuid,uuid,text,text,text)','execute'),'authenticated caption operation granted');
insert into public.articles(id,owner_profile_id,section_id,title,slug,content)
values ('59000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
 '20000000-0000-0000-0000-000000000051','Caption fixture','caption-fixture',
 '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Caption fixture body"}]}]}}');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
values ('59000000-0000-0000-0000-000000000002','59000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002','59000000-0000-0000-0000-000000000003','caption/fixture.webp','finalized',1234,120,90,repeat('a',64),now());
create function pg_temp.caption(p_caption text,p_request uuid default gen_random_uuid(),p_version integer default null)
returns jsonb language sql as $$
 select public.set_article_main_image(a.id,coalesce(p_version,a.edit_version),p_request,
 '59000000-0000-0000-0000-000000000002','Caption alt','Caption credit',p_caption)
 from public.articles a where a.id='59000000-0000-0000-0000-000000000001';
$$;
set local role authenticated;
select is(pg_temp.caption(repeat('x',401))->>'code','invalid_input','401-character caption rejected');
select is(pg_temp.caption('  Caption text  ','59000000-0000-0000-0000-000000000004',1)->>'version','2','trimmed caption attaches atomically');
select is(pg_temp.caption('Caption text','59000000-0000-0000-0000-000000000004',1)->>'replayed','true','normalized exact caption retry replays');
select is(pg_temp.caption('Different caption','59000000-0000-0000-0000-000000000004',1)->>'code','request_conflict','changed caption cannot reuse receipt');
select is(pg_temp.caption('')->>'version','3','empty caption clears it');
select is(pg_temp.caption(repeat('x',400))->>'version','4','400-character caption accepted');
select is(pg_temp.caption('Final caption')->>'version','5','caption-only edit bumps version');
reset role;
select is((select caption from public.article_main_images where article_id='59000000-0000-0000-0000-000000000001'),'Final caption','caption stored trimmed');
select is((select snapshot->'mainImage'->>'caption' from public.article_revisions where article_id='59000000-0000-0000-0000-000000000001' and (snapshot#>>'{article,editVersion}')::integer=3),null::text,'cleared caption captured as JSON null');
select is((select snapshot->'mainImage'->>'caption' from public.article_revisions where article_id='59000000-0000-0000-0000-000000000001' and (snapshot#>>'{article,editVersion}')::integer=5),'Final caption','snapshot includes caption');
select is(public.get_public_article('caption-fixture')->>'kind','notFound','draft caption not projected publicly');
update public.articles set status='published',published_at=now() where id='59000000-0000-0000-0000-000000000001';
set local role anon;
select is(public.get_public_article('caption-fixture')#>>'{article,mainImage,caption}','Final caption','published projection includes caption');
reset role;
update public.articles set status='archived',archived_at=now() where id='59000000-0000-0000-0000-000000000001';
select is(public.get_public_article('caption-fixture')->>'kind','notFound','archived caption not projected publicly');
update public.articles set status='draft',published_at=null,archived_at=null where id='59000000-0000-0000-0000-000000000001';
-- A deployment must not break an old in-flight null-caption request receipt.
select is(pg_temp.caption(null,'59000000-0000-0000-0000-000000000005',5)->>'ok','true','null-caption request succeeds');
update private.media_write_receipts set payload_hash=sha256(convert_to(jsonb_build_object(
 'articleId','59000000-0000-0000-0000-000000000001'::uuid,'expectedVersion',5,
 'assetId','59000000-0000-0000-0000-000000000002'::uuid,'altText','Caption alt','credit','Caption credit')::text,'UTF8'))
 where request_id='59000000-0000-0000-0000-000000000005';
set local role authenticated;
select is(pg_temp.caption(null,'59000000-0000-0000-0000-000000000005',5)->>'replayed','true','legacy null-caption fingerprint remains replayable');
select is(pg_temp.caption('New caption','59000000-0000-0000-0000-000000000005',5)->>'code','request_conflict','non-null caption never matches legacy receipt');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is(pg_temp.caption('Denied')->>'code','not_found','non-owner cannot edit caption');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is(pg_temp.caption('Denied')->>'code','forbidden','inactive member cannot edit caption');
select * from finish();
rollback;
