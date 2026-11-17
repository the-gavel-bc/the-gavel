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
-- ready(n, owner): a publication-ready draft owned by that user.
create function pg_temp.ready(n integer, u text) returns uuid language plpgsql as $$
declare a uuid;
begin
  perform pg_temp.act_as(u);
  set local role authenticated;
  a := (public.create_article_draft(('80000000-0000-0000-0000-0000000067'||lpad(n::text,2,'0'))::uuid,
    pg_temp.draft_input(pg_temp.body()))->>'articleId')::uuid;
  reset role;
  insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,
    byte_size,width,height,sha256,finalized_at)
  values (('60000000-0000-0000-0000-0000000067'||lpad(n::text,2,'0'))::uuid,a,
    ('00000000-0000-0000-0000-00000000000'||u)::uuid,('81000000-0000-0000-0000-0000000067'||lpad(n::text,2,'0'))::uuid,
    'review/'||n||'.webp','finalized',1234,120,90,repeat('c',64),now());
  insert into public.article_main_images(article_id,asset_id,alt_text,credit)
  values (a,('60000000-0000-0000-0000-0000000067'||lpad(n::text,2,'0'))::uuid,'Alt','Credit');
  return a;
end;
$$;
create temp table t(label text primary key, id uuid, res jsonb);
grant all on t to authenticated;
insert into t(label,id) values ('a1',pg_temp.ready(1,'2')),('a2',pg_temp.ready(2,'2')),('a3',pg_temp.ready(3,'2')),('e1',pg_temp.ready(4,'3'));
create function pg_temp.call(who text, fn text, lbl text, p_v integer default null, note text default null)
returns jsonb language plpgsql as $$
declare r jsonb; aid uuid := (select id from t where label=lbl); v integer := p_v;
begin
  v := coalesce(p_v,(select edit_version from public.articles where id=aid));
  perform pg_temp.act_as(who); set local role authenticated;
  if fn='submit' then r:=public.submit_article(aid,v,gen_random_uuid());
  elsif fn='publish' then r:=public.publish_article(aid,v,gen_random_uuid());
  elsif fn='archive' then r:=public.archive_article(aid,v,gen_random_uuid());
  elsif fn='return' then r:=public.return_article(aid,v,gen_random_uuid(),note);
  elsif fn='save' then r:=public.save_article_draft(aid,v,gen_random_uuid(),pg_temp.draft_input(pg_temp.body()||'{"title":"Copy edited"}'));
  elsif fn='save_pub' then r:=public.save_published_article(aid,v,gen_random_uuid(),pg_temp.draft_input(pg_temp.body()||'{"title":"Copy edited"}'));
  end if;
  reset role; return r;
end;
$$;
grant execute on function pg_temp.call(text,text,text,integer,text) to authenticated;

-- Authors cannot publish their own work.
select is(pg_temp.call('2','publish','a1')->>'code','not_found','author cannot publish own draft');
-- Submit.
select is(pg_temp.call('3','submit','a1')->>'code','not_found','another member cannot submit someone else''s draft');
select is(pg_temp.call('2','submit','a1')->>'ok','true','author submits for review');
select ok((select review_requested_at is not null from public.articles where id=(select id from t where label='a1')),'review time recorded');
select is(pg_temp.call('2','submit','a1')->>'code','conflict','cannot submit twice');
select is(pg_temp.call('2','save','a1')->>'code','not_found','author cannot edit while in review');
select is(pg_temp.call('2','publish','a1')->>'code','not_found','author cannot publish after submitting');
-- Editor review.
select is(pg_temp.call('3','save','a1')->>'ok','true','editor copy-edits an article in review');
select is((select title from public.articles where id=(select id from t where label='a1')),'Copy edited','edit applied');
select is(pg_temp.call('3','save','a2')->>'code','not_found','editor cannot edit an unsubmitted draft');
select is(pg_temp.call('3','publish','a2')->>'code','not_found','editor cannot publish an unsubmitted draft');
select is(pg_temp.call('3','return','a1',null,null)->>'code','invalid_input','return needs a note');
select is(pg_temp.call('3','return','a1',null,'Fix the lede')->>'ok','true','editor returns with a note');
select is((select review_note from public.articles where id=(select id from t where label='a1')),'Fix the lede','note stored');
select is(pg_temp.call('2','save','a1')->>'ok','true','author edits again after return');
select is(pg_temp.call('2','submit','a1')->>'ok','true','author resubmits');
select is((select review_note from public.articles where id=(select id from t where label='a1')),null,'note cleared on resubmit');
select is(pg_temp.call('3','publish','a1')->>'ok','true','editor publishes a submitted article');
select is((select published_by_profile_id from public.articles where id=(select id from t where label='a1')),
  '10000000-0000-0000-0000-000000000003'::uuid,'publisher recorded');
select is(pg_temp.call('3','save_pub','a1')->>'code','not_found','editor cannot edit a published article');
select is(pg_temp.call('2','archive','a1')->>'code','not_found','author cannot archive');
select is(pg_temp.call('3','archive','a1')->>'ok','true','editor archives what they published');
-- Editors own articles publish directly; archive limited to own publications.
select is(pg_temp.call('3','publish','e1')->>'ok','true','editor publishes own article');
select is(pg_temp.call('4','publish','a2')->>'ok','true','administrator publishes any draft');
select is(pg_temp.call('3','archive','a2')->>'code','not_found','editor cannot archive another publisher''s article');
select is(pg_temp.call('4','archive','a2')->>'ok','true','administrator archives anything');
-- Reads.
select pg_temp.act_as('3'); set local role authenticated;
select is((select count(*)::integer from public.articles where id=(select id from t where label='a3')),0,'editor cannot read unsubmitted drafts');
reset role;
select is(pg_temp.call('2','submit','a3')->>'ok','true','second author submission');
select pg_temp.act_as('3'); set local role authenticated;
select is((select count(*)::integer from public.articles where id=(select id from t where label='a3')),1,'editor reads submitted drafts');
select is((select count(*)::integer from public.list_review_articles()),2,'review queue: one submission plus own publication');
reset role;
select pg_temp.act_as('2'); set local role authenticated;
select throws_ok('select * from public.list_review_articles()','42501',null,'authors cannot open the review queue');
reset role;
select ok(not has_function_privilege('authenticated','private.article_authority(uuid,uuid,text)','EXECUTE'),'authority helper is private');
select pg_temp.act_as('4'); set local role authenticated;
select is((select editors from public.staff_summary()),1,'staff summary counts editors');
reset role;
select * from finish();
rollback;
