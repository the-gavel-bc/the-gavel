begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
-- 2 = author A, 3 becomes the editor, 4 = administrator.
update public.memberships set role='editor' where user_id='00000000-0000-0000-0000-000000000003';
create function pg_temp.act_as(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000'||u,true);
$$;
grant execute on function pg_temp.act_as(text) to authenticated;
create function pg_temp.body() returns jsonb language sql as $$
  select jsonb_build_object('content','{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Story"}]}]}}'::jsonb);
$$;
grant execute on function pg_temp.body() to authenticated;
-- ready(n, owner): a publication-ready draft owned by that user.
create function pg_temp.ready(n integer, u text) returns uuid language plpgsql as $$
declare a uuid;
begin
  perform pg_temp.act_as(u);
  set local role authenticated;
  a := (public.create_article_draft(('80000000-0000-0000-0000-0000000089'||lpad(n::text,2,'0'))::uuid,
    pg_temp.draft_input(pg_temp.body()))->>'articleId')::uuid;
  reset role;
  insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
    byte_size,width,height,sha256,finalized_at)
  values (('60000000-0000-0000-0000-0000000089'||lpad(n::text,2,'0'))::uuid,a,
    ('00000000-0000-0000-0000-00000000000'||u)::uuid,('81000000-0000-0000-0000-0000000089'||lpad(n::text,2,'0'))::uuid,
    'review/'||n||'.webp','finalized',1234,120,90,repeat('c',64),now());
  insert into public.article_main_images(article_id,asset_id,alt_text,credit)
  values (a,('60000000-0000-0000-0000-0000000089'||lpad(n::text,2,'0'))::uuid,'Alt','Credit');
  return a;
end;
$$;
create temp table t(label text primary key, id uuid, res jsonb);
grant all on t to authenticated;
insert into t(label,id) values ('a1',pg_temp.ready(1,'2')),('a2',pg_temp.ready(2,'2')),('e1',pg_temp.ready(3,'3'));
create function pg_temp.call(who text, fn text, lbl text, p_v integer default null, note text default null)
returns jsonb language plpgsql as $$
declare r jsonb; aid uuid := (select id from t where label=lbl); v integer := p_v;
begin
  v := coalesce(p_v,(select edit_version from public.articles where id=aid));
  perform pg_temp.act_as(who); set local role authenticated;
  if fn='submit' then r:=public.submit_article(aid,v,gen_random_uuid());
  elsif fn='publish' then r:=public.publish_article(aid,v,gen_random_uuid());
  elsif fn='archive' then r:=public.archive_article(aid,v,gen_random_uuid());
  elsif fn='restore' then r:=public.restore_article(aid,v,gen_random_uuid());
  elsif fn='delete' then r:=public.delete_archived_article(aid,v,gen_random_uuid(),true);
  elsif fn='return' then r:=public.return_article(aid,v,gen_random_uuid(),note);
  elsif fn='save' then r:=public.save_article_draft(aid,v,gen_random_uuid(),pg_temp.draft_input(pg_temp.body()||'{"title":"Copy edited"}'));
  elsif fn='save_pub' then r:=public.save_published_article(aid,v,gen_random_uuid(),pg_temp.draft_input(pg_temp.body()||'{"title":"Copy edited"}'));
  end if;
  reset role; return r;
end;
$$;
grant execute on function pg_temp.call(text,text,text,integer,text) to authenticated;

create function pg_temp.fix(who text, lbl text, expected text, note text, req uuid default gen_random_uuid())
returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.act_as(who); set local role authenticated;
  r := public.set_article_correction((select id from t where label=lbl),expected,req,note);
  reset role; return r;
end;
$$;
grant execute on function pg_temp.fix(text,text,text,text,uuid) to authenticated;

select ok(not has_function_privilege('anon','public.set_article_correction(uuid,text,uuid,text)','EXECUTE'),'anonymous cannot call it');
-- Unsubmitted draft: neither the author nor an editor may add one; an administrator may.
select is(pg_temp.fix('2','a1',null,'Oops')->>'code','not_found','author cannot correct own draft');
select is(pg_temp.fix('3','a1',null,'Oops')->>'code','not_found','editor cannot correct a draft that is not in review');
select is(pg_temp.fix('4','a1',null,'Admin note')->>'ok','true','administrator corrects any live article');
-- In review: the editor may.
select is(pg_temp.call('2','submit','a2')->>'ok','true','author submits');
select is(pg_temp.fix('2','a2',null,'Oops')->>'code','not_found','author still cannot correct');
select is(pg_temp.fix('3','a2','x','Stale')->>'code','conflict','a wrong expected value is a conflict');
select is(pg_temp.fix('3','a2',null,'<b>x</b>')->>'code','invalid_input','markup is refused');
select is(pg_temp.fix('3','a2',null,repeat('x',2001))->>'code','invalid_input','over 2000 characters is refused');
select is(pg_temp.fix('3','a2',null,'Earlier version misstated the date.')->>'ok','true','editor corrects an article in review');
-- Publish as the editor: they published it, so they may correct it.
select is(pg_temp.call('3','publish','a2')->>'ok','true','editor publishes');
select is(pg_temp.fix('3','a2','Earlier version misstated the date.','The date was Nov. 3.')->>'ok','true','editor corrects an article they published');
select is((select correction from public.articles a join t on t.id=a.id where t.label='a2'),'The date was Nov. 3.','stored');
select ok((select correction_updated_at is not null from public.articles a join t on t.id=a.id where t.label='a2'),'timestamp set');
-- The administrator publishes the editor''s own article: the editor did not publish it.
select is(pg_temp.call('4','publish','e1')->>'ok','true','administrator publishes the editor''s draft');
select is(pg_temp.fix('3','e1',null,'Not mine')->>'code','not_found','editor cannot correct an article they did not publish');
select is(pg_temp.fix('4','e1',null,'Admin fixes')->>'ok','true','administrator corrects it');
-- Retry safety.
create temp table rq as select gen_random_uuid() id;
grant select on rq to authenticated;
select is(pg_temp.fix('4','e1','Admin fixes','Second',(select id from rq))->>'ok','true','first request');
select is(pg_temp.fix('4','e1','Admin fixes','Second',(select id from rq))->>'replayed','true','exact retry replays');
select is(pg_temp.fix('4','e1','Admin fixes','Different',(select id from rq))->>'code','request_conflict','changed payload with the same id conflicts');
select is(pg_temp.fix('4','e1','Second','Second')->>'changed','false','same text again changes nothing');
-- Public reads.
create temp table pub as select slug from public.articles a join t on t.id=a.id where t.label='a2';
grant select on pub to anon;
set local role anon;
select is(public.get_public_article((select slug from pub))->'article'->>'correction',
  'The date was Nov. 3.','the public article carries the correction');
select ok(public.get_public_article((select slug from pub))->'article'->>'correctedAt' is not null,'and the date');
reset role;
-- Clearing.
select is(pg_temp.fix('4','e1','Second','   ')->>'ok','true','blank clears');
select is((select correction from public.articles a join t on t.id=a.id where t.label='e1'),null,'cleared');
select is((select correction_updated_at from public.articles a join t on t.id=a.id where t.label='e1'),null,'timestamp cleared with it');
select is((select count(*)::int from public.audit_events where action='article.corrected'),6,'each real change is audited once');
select * from finish();
rollback;
