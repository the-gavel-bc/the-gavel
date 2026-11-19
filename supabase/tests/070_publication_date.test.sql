begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
-- 2 = author A (owner), 4 = administrator. Editors are covered by 067/068.
create function pg_temp.act_as(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000'||u,true);
$$;
grant execute on function pg_temp.act_as(text) to authenticated;
create function pg_temp.body() returns jsonb language sql as $$
  select jsonb_build_object('content','{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Story"}]}]}}'::jsonb);
$$;
create temp table t(label text primary key, id uuid);
grant all on t to authenticated;
-- create_as(u, label, n, patch): create a draft with extra input, return the result code.
create function pg_temp.create_as(u text, lbl text, n integer, patch jsonb) returns text language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.create_article_draft(('80000000-0000-0000-0000-0000000070'||lpad(n::text,2,'0'))::uuid,
    pg_temp.draft_input(pg_temp.body()||patch));
  reset role;
  if (r->>'ok')='true' then insert into t values (lbl,(r->>'articleId')::uuid); end if;
  return coalesce(r->>'code','ok');
end; $$;
grant execute on function pg_temp.create_as(text,text,integer,jsonb) to authenticated;
create function pg_temp.save_as(u text, lbl text, patch jsonb) returns jsonb language plpgsql as $$
declare r jsonb; v integer := (select edit_version from public.articles where id=(select id from t where label=lbl));
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.save_article_draft((select id from t where label=lbl),v,gen_random_uuid(),pg_temp.draft_input(pg_temp.body()||patch));
  reset role; return r;
end; $$;
grant execute on function pg_temp.save_as(text,text,jsonb) to authenticated;
create function pg_temp.ready(lbl text, n integer) returns void language plpgsql as $$
declare a uuid := (select id from t where label=lbl);
begin
  insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
  values (('61000000-0000-0000-0000-0000000070'||lpad(n::text,2,'0'))::uuid,a,'00000000-0000-0000-0000-000000000002',gen_random_uuid(),'pd/'||n||'.webp','finalized',1234,120,90,repeat('f',64),now());
  insert into public.article_main_images(article_id,asset_id,alt_text,credit)
  values (a,('61000000-0000-0000-0000-0000000070'||lpad(n::text,2,'0'))::uuid,'Alt','Credit');
end; $$;
create function pg_temp.pub_as(u text, lbl text) returns jsonb language plpgsql as $$
declare r jsonb; v integer := (select edit_version from public.articles where id=(select id from t where label=lbl));
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.publish_article((select id from t where label=lbl),v,gen_random_uuid());
  reset role; return r;
end; $$;
grant execute on function pg_temp.pub_as(text,text) to authenticated;

-- Validation on create.
select is(pg_temp.create_as('2','past',1,'{"publicationDate":"2026-01-15"}'),'ok','a past date is accepted');
select is(pg_temp.create_as('2','none',2,'{}'),'ok','an older client without the key is accepted');
select is(pg_temp.create_as('2','null',3,'{"publicationDate":null}'),'ok','null means the publish day');
select is(pg_temp.create_as('2','x',4,jsonb_build_object('publicationDate',(((now() at time zone 'America/New_York')::date)+1)::text)),'invalid_input','a future date is refused');
select is(pg_temp.create_as('2','x',5,'{"publicationDate":"2026-02-30"}'),'invalid_input','an impossible calendar date is refused');
select is(pg_temp.create_as('2','x',6,'{"publicationDate":"01/15/2026"}'),'invalid_input','a wrong format is refused');
select is(pg_temp.create_as('2','x',7,'{"publicationDate":20260115}'),'invalid_input','a non-string is refused');
select is((select publication_date::text from public.articles where id=(select id from t where label='past')),'2026-01-15','the date is stored');
select is((select count(*)::int from public.articles where id=(select id from t where label='none') and publication_date is null),1,'no date is stored as null');

-- Saving: only a date change is a real change; resending is a no-op.
select is((pg_temp.save_as('2','none','{"publicationDate":"2026-02-01"}'))->>'changed','true','changing only the date is a change');
select is((select edit_version from public.articles where id=(select id from t where label='none')),2,'it bumps the version');
select is((pg_temp.save_as('2','none','{"publicationDate":"2026-02-01"}'))->>'changed','false','resending the same date is a no-op');
select is((pg_temp.save_as('2','none','{"publicationDate":null}'))->>'changed','true','clearing the date is a change');
select is((pg_temp.save_as('2','none','{"publicationDate":"2999-01-01"}'))->>'code','invalid_input','a future date is refused on save');

-- Publishing: blank is now, past is noon Eastern of that day. Authors cannot publish, so an administrator does.
select pg_temp.ready('past',1); select pg_temp.ready('null',2);
select is(pg_temp.pub_as('4','null')->>'ok','true','publish with no date');
select ok((select abs(extract(epoch from now()-published_at))<60 from public.articles where id=(select id from t where label='null')),'no date publishes as now');
select is(pg_temp.pub_as('4','past')->>'ok','true','publish with a past date');
select is((select (published_at at time zone 'America/New_York')::text from public.articles where id=(select id from t where label='past')),'2026-01-15 12:00:00','a past date publishes at noon Eastern');
select is((select publication_date::text from public.articles where id=(select id from t where label='null')),null,'a blank date stays blank after publishing');

-- A date set after the fact into the future (direct data) cannot be published.
select is(pg_temp.create_as('2','late',8,'{}'),'ok','draft for the future-publish check');
select pg_temp.ready('late',3);
update public.articles set publication_date=((now() at time zone 'America/New_York')::date)+2 where id=(select id from t where label='late');
select is(pg_temp.pub_as('4','late')->>'code','invalid_input','a future date cannot be published');

-- After publication only an administrator changes the date, and published_at follows.
create function pg_temp.save_pub(u text, lbl text, patch jsonb) returns jsonb language plpgsql as $$
declare r jsonb; v integer := (select edit_version from public.articles where id=(select id from t where label=lbl));
begin
  perform pg_temp.act_as(u); set local role authenticated;
  r := public.save_published_article((select id from t where label=lbl),v,gen_random_uuid(),pg_temp.draft_input(pg_temp.body()||patch));
  reset role; return r;
end; $$;
grant execute on function pg_temp.save_pub(text,text,jsonb) to authenticated;
select is(pg_temp.save_pub('2','past','{"publicationDate":"2026-01-10"}')->>'code','not_found','the author cannot change a published date');
select is(pg_temp.save_pub('4','past','{"publicationDate":"2026-01-10"}')->>'ok','true','an administrator can');
select is((select (published_at at time zone 'America/New_York')::text from public.articles where id=(select id from t where label='past')),'2026-01-10 12:00:00','published_at follows the new date');
select is((select count(*)::int from public.audit_events where action='article.updated' and resource_id=(select id from t where label='past')),1,'the change is audited');
select * from finish();
rollback;
