begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
-- 2 = author A (owner), 3 = editor (later demoted to "other author"), 4 = administrator.
update public.memberships set role='editor' where user_id='00000000-0000-0000-0000-000000000003';
create function pg_temp.act_as(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000'||u,true);
$$;
grant execute on function pg_temp.act_as(text) to authenticated, service_role;
create temp table art(label text primary key, id uuid, asset uuid);
grant all on art to authenticated, service_role;
-- Three drafts owned by A: one in review, one not submitted, one published.
create function pg_temp.mk(n integer, lbl text, p_review boolean, p_status text) returns void language plpgsql as $$
declare a uuid;
begin
  perform pg_temp.act_as('2'); set local role authenticated;
  a := (public.create_article_draft(('80000000-0000-0000-0000-0000000068'||lpad(n::text,2,'0'))::uuid,
    pg_temp.draft_input())->>'articleId')::uuid;
  reset role;
  update public.articles set review_requested_at = case when p_review then now() end,
    status = p_status::public.article_status,
    published_at = case when p_status='published' then now() end where id=a;
  -- a finalized image owned by author A to act on
  insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
    byte_size,width,height,sha256,finalized_at)
  values (('61000000-0000-0000-0000-0000000068'||lpad(n::text,2,'0'))::uuid,a,'00000000-0000-0000-0000-000000000002',
    gen_random_uuid(),'editor-media/'||n||'.webp','finalized',1234,120,90,repeat('e',64),now());
  insert into art values (lbl,a,('61000000-0000-0000-0000-0000000068'||lpad(n::text,2,'0'))::uuid);
end;
$$;
select pg_temp.mk(1,'review',true,'draft'),pg_temp.mk(2,'plain',false,'draft'),pg_temp.mk(3,'pub',false,'published');
-- Run one call as a user with a role set; returns the result code or 'ok'.
create function pg_temp.code(r jsonb) returns text language sql as $$ select coalesce(r->>'code', case when (r->>'ok')='true' then 'ok' end) $$;
create function pg_temp.req(u text, lbl text, n integer) returns text language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.request_article_image_upload((select id from art where label=lbl),
    ('82000000-0000-0000-0000-0000000068'||lpad(n::text,2,'0'))::uuid);
  reset role; return pg_temp.code(r);
end; $$;
create function pg_temp.mark(u text, lbl text) returns text language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.mark_article_image_for_removal((select asset from art where label=lbl));
  reset role; return pg_temp.code(r);
end; $$;
create function pg_temp.main(u text, lbl text) returns text language plpgsql as $$
declare r jsonb; v integer := (select edit_version from public.articles where id=(select id from art where label=lbl));
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.set_article_main_image((select id from art where label=lbl),v,
    gen_random_uuid(),(select asset from art where label=lbl),'Alt','Credit');
  reset role; return pg_temp.code(r);
end; $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Reserve an upload (request_article_image_upload).
select is(pg_temp.req('2','review',1),'not_found','author cannot upload to an article in review');
select is(pg_temp.req('3','review',2),'ok','editor can upload to an article in review');
select is(pg_temp.req('3','plain',3),'not_found','editor cannot upload to an unsubmitted draft');
select is(pg_temp.req('3','pub',4),'not_found','editor cannot upload to a published article');
select is(pg_temp.req('2','pub',5),'not_found','author cannot upload to their published article');
select is(pg_temp.req('2','plain',6),'ok','author uploads to their own unsubmitted draft');
select is(pg_temp.req('4','pub',7),'ok','administrator uploads to a published article');
-- Attach a main image.
select is(pg_temp.main('2','review'),'not_found','author cannot attach a main image in review');
select is(pg_temp.main('3','review'),'ok','editor attaches a main image in review');
select is(pg_temp.main('3','plain'),'not_found','editor cannot attach on an unsubmitted draft');
select is(pg_temp.main('3','pub'),'not_found','editor cannot attach on a published article');
-- Remove (mark).
select is(pg_temp.mark('2','review'),'not_found','author cannot remove an image in review');
select is(pg_temp.mark('3','plain'),'not_found','editor cannot remove from an unsubmitted draft');
select is(pg_temp.mark('3','pub'),'not_found','editor cannot remove from a published article');
select is(pg_temp.mark('2','plain'),'ok','author removes from their own unsubmitted draft');
-- Admit an upload reservation: only its uploader or an administrator.
create function pg_temp.admit(u text, lbl text, rid text) returns text language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.admit_article_image_upload((select id from art where label=lbl),
    (select id from public.media_assets where request_id=rid::uuid));
  reset role; return pg_temp.code(r);
end; $$;
grant execute on function pg_temp.admit(text,text,text) to authenticated;
select is(pg_temp.admit('3','review','82000000-0000-0000-0000-000000006802'),'ok','the editor can process their own reservation');
select is(pg_temp.admit('4','plain','82000000-0000-0000-0000-000000006806'),'ok','an administrator can process another member''s reservation');
-- An editor cannot continue someone else's reservation on an article they may edit.
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
  select '61000000-0000-0000-0000-000000006890',id,'00000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000006890','editor-media/authors.webp','pending'
  from art where label='review';
select is(pg_temp.admit('3','review','82000000-0000-0000-0000-000000006890'),'not_found','an editor cannot continue an author''s reservation');
-- Trusted begin: same rules, claimed actor.
set local role service_role;
select is((public.begin_article_image_upload('00000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000006890')->>'code'),'conflict','trusted begin refuses an editor on another uploader''s asset');
select is((public.begin_article_image_upload('00000000-0000-0000-0000-000000000004','61000000-0000-0000-0000-000000006890')->>'ok'),'true','trusted begin accepts an administrator');
select is((public.begin_article_image_upload('00000000-0000-0000-0000-000000000002','61000000-0000-0000-0000-000000006890')->>'code'),'not_found','trusted begin refuses the author once the article is in review');
reset role;
-- Inactive editor.
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000003';
select is(pg_temp.req('3','review',8),'forbidden','an inactive editor is refused');
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000003';
-- A demoted editor is just another author.
update public.memberships set role='author' where user_id='00000000-0000-0000-0000-000000000003';
select is(pg_temp.req('3','review',9),'not_found','a demoted editor loses access at once');

-- Administrator purge of an image only history references.
insert into public.article_revisions(article_id,actor_user_id,snapshot)
  select id,'00000000-0000-0000-0000-000000000002',private.capture_draft_snapshot(id) from art where label='pub';
create function pg_temp.purge(u text, lbl text) returns text language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.purge_article_image((select id from art where label=lbl),(select asset from art where label=lbl));
  reset role; return pg_temp.code(r);
end; $$;
grant execute on function pg_temp.purge(text,text) to authenticated;
select is(pg_temp.purge('2','review'),'not_found','an author cannot purge');
select is(pg_temp.purge('4','review'),'conflict','an attached image cannot be purged');
insert into private.article_revision_media_refs(revision_id,article_id,asset_id)
  select r.id,r.article_id,(select asset from art where label='pub') from public.article_revisions r
  where r.article_id=(select id from art where label='pub') limit 1;
select is(pg_temp.purge('4','pub'),'ok','an administrator purges an image only history references');
select is((select status from public.media_assets where id=(select asset from art where label='pub')),'deleting','the image is hidden at once');
select is((select count(*)::int from private.article_revision_media_refs where asset_id=(select asset from art where label='pub')),0,'history no longer pins it');
select is((select count(*)::int from public.audit_events where action='article.image_purged'),1,'the purge is audited');
select * from finish();
rollback;
