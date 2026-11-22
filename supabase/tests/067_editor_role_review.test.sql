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
insert into t(label,id) values ('a1',pg_temp.ready(1,'2')),('a2',pg_temp.ready(2,'2')),('a3',pg_temp.ready(3,'2')),('e1',pg_temp.ready(4,'3')),('a4',pg_temp.ready(5,'2'));
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

-- Authors cannot publish their own work.
select is(pg_temp.call('2','publish','a1')->>'code','not_found','author cannot publish own draft');
-- Submit.
select is(pg_temp.call('3','submit','a1')->>'code','not_found','another member cannot submit someone else''s draft');
select is(pg_temp.call('2','submit','a1')->>'ok','true','author submits for review');
select ok((select review_requested_at is not null from public.articles where id=(select id from t where label='a1')),'review time recorded');
select is(pg_temp.call('2','submit','a1')->>'code','conflict','cannot submit twice');
select is(pg_temp.call('2','save','a1')->>'code','not_found','author cannot edit while in review');
select is(pg_temp.call('2','publish','a1')->>'code','not_found','author cannot publish after submitting');
create temp table submit_receipt as
  select id,edit_version,gen_random_uuid() as request_id,null::jsonb as result
  from public.articles where id=(select id from t where label='a4');
grant select,update on submit_receipt to authenticated;
select pg_temp.act_as('2'); set local role authenticated;
update submit_receipt set result=public.submit_article(id,edit_version,request_id);
select is((select result->>'ok' from submit_receipt),'true','author submits second article');
select is((select public.submit_article(id,edit_version,request_id) from submit_receipt),
  (select result||'{"replayed":true}'::jsonb from submit_receipt),
  'exact submit retry returns its original receipt');
select is((select public.submit_article(id,edit_version+1,request_id) from submit_receipt)->>'code',
  'request_conflict','changed submit request cannot reuse receipt');
reset role;
update private.draft_write_limits set attempt_count=30,window_start=clock_timestamp()
where actor_user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select public.submit_article(id,edit_version,request_id) from submit_receipt)->>'replayed',
  'true','exact transition replay remains available at the write limit');
reset role;
select is((select attempt_count from private.draft_write_limits where actor_user_id=auth.uid()),
  30,'transition replay consumes no additional write attempt');
update private.draft_write_limits set attempt_count=0
where actor_user_id='00000000-0000-0000-0000-000000000002';
select is(pg_temp.call('3','publish','a4')->>'ok','true','editor publishes receipt fixture');
select is(pg_temp.call('3','archive','a4')->>'ok','true','editor clears receipt fixture from review queue');
-- Editor review.
select is(pg_temp.call('3','save','a1')->>'ok','true','editor copy-edits an article in review');
select is((select title from public.articles where id=(select id from t where label='a1')),'Copy edited','edit applied');
select is(pg_temp.call('3','save','a2')->>'code','not_found','editor cannot edit an unsubmitted draft');
select is(pg_temp.call('3','publish','a2')->>'code','not_found','editor cannot publish an unsubmitted draft');
select is(pg_temp.call('3','return','a1',null,null)->>'code','invalid_input','return needs a note');
select is(pg_temp.call('3','return','a1',null,repeat('x',501))->>'code','invalid_input','return note has a 500 character maximum');
select is(pg_temp.call('3','return','a1',null,U&'Fix\202Ethe lede')->>'code',
  'invalid_input','new return notes reject bidi override characters');
create temp table return_receipt as
  select id,edit_version,gen_random_uuid() as request_id,null::jsonb as result
  from public.articles where id=(select id from t where label='a1');
grant select,update on return_receipt to authenticated;
select pg_temp.act_as('3'); set local role authenticated;
update return_receipt set result=public.return_article(id,edit_version,request_id,'Fix the lede');
select is((select result->>'ok' from return_receipt),'true','editor returns with a note');
select is((select public.return_article(id,edit_version,request_id,'Fix the lede') from return_receipt),
  (select result||'{"replayed":true}'::jsonb from return_receipt),
  'exact return retry returns its original receipt');
select is((select public.return_article(id,edit_version,request_id,'Different note') from return_receipt)->>'code',
  'request_conflict','changed return note cannot reuse receipt');
reset role;
select is((select review_note from public.articles where id=(select id from t where label='a1')),'Fix the lede','note stored');
-- Change the synthetic receipt to a fingerprint that could predate this rule.
update private.draft_write_receipts set payload_hash=private.draft_request_hash(
  U&'return:Fix\202Ethe lede',article_id,expected_version,'{}')
where request_id=(select request_id from return_receipt);
set local role authenticated;
select is((select public.return_article(id,edit_version,request_id,U&'Fix\202Ethe lede') from return_receipt),
  (select result||'{"replayed":true}'::jsonb from return_receipt),
  'old return notes still replay an exact committed request');
reset role;
select is(pg_temp.call('2','save','a1')->>'ok','true','author edits again after return');
-- Save while the owner may edit; replay the same receipt after submission.
select pg_temp.act_as('2');
create temp table saved_before_submit as
  select id, edit_version, gen_random_uuid() as request_id from public.articles where id=(select id from t where label='a1');
grant select on saved_before_submit to authenticated;
set local role authenticated;
select is((select public.save_article_draft(id,edit_version,request_id,pg_temp.draft_input(pg_temp.body())) from saved_before_submit)->>'ok','true','author saves before resubmitting');
reset role;
-- A historical save receipt used a canonical input that still included slug.
insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,
  expected_version,payload_hash,result_version,result_updated_at,changed)
select auth.uid(),'80000000-0000-0000-0000-000000006750','save',a.id,s.edit_version,
  private.draft_request_hash('save',a.id,s.edit_version,
    private.check_draft_input_with_slug(pg_temp.draft_input(pg_temp.body()||jsonb_build_object('slug',a.slug)))->'value'),
  a.edit_version,a.updated_at,true
from public.articles a join saved_before_submit s using (id);
select is(pg_temp.call('2','submit','a1')->>'ok','true','author resubmits');
select pg_temp.act_as('2');
set local role authenticated;
select is((select public.save_article_draft(id,edit_version,request_id,pg_temp.draft_input(pg_temp.body())) from saved_before_submit)->>'replayed','true','original author receives their exact save receipt after resubmitting');
select is((select public.save_article_draft(id,edit_version,request_id,pg_temp.draft_input(pg_temp.body()||'{"title":"Different payload"}')) from saved_before_submit)->>'code','request_conflict','receipt rejects a changed payload');
select is((select public.save_article_draft(a.id,s.edit_version,'80000000-0000-0000-0000-000000006750',
  pg_temp.draft_input(pg_temp.body()||jsonb_build_object('slug',a.slug)))
  from saved_before_submit s join public.articles a on a.id=s.id)->>'replayed','true',
  'historical slug-bearing save receipt replays after submission');
reset role;
select is((select review_note from public.articles where id=(select id from t where label='a1')),null,'note cleared on resubmit');
select is(pg_temp.call('3','publish','a1')->>'ok','true','editor publishes a submitted article');
select ok((select review_requested_at is null and review_note is null from public.articles where id=(select id from t where label='a1')),'publish clears review metadata');
select ok(exists(
  select 1 from jsonb_array_elements(public.list_public_sitemap_articles(null,null,100)->'items') item
  where item->>'id'=(select id::text from t where label='a1')),
  'checked publish transition makes article visible in sitemap');
select throws_ok(
  $$update public.articles set review_requested_at=now() where id=(select id from t where label='a1')$$,
  '23514', null, 'non-drafts cannot carry review metadata'
);

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
select is(pg_temp.call('2','restore','a2')->>'code','not_found','author cannot restore an archived article');
select is(pg_temp.call('2','delete','a2')->>'code','forbidden','author cannot delete an archived article');
-- Reads.
select pg_temp.act_as('3'); set local role authenticated;
select is((select count(*)::integer from public.articles where id=(select id from t where label='a3')),0,'editor cannot read unsubmitted drafts');
reset role;
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
  select '60000000-0000-0000-0000-000000006799',id,'00000000-0000-0000-0000-000000000002',gen_random_uuid(),'review/unfinished.webp','uploading' from t where label='a3';
select is(pg_temp.call('2','submit','a3')->>'code','conflict','submit is refused while an upload is unfinished');
delete from public.media_assets where id='60000000-0000-0000-0000-000000006799';
select is(pg_temp.call('2','submit','a3')->>'ok','true','second author submission');
select pg_temp.act_as('3'); set local role authenticated;
select is((select count(*)::integer from public.articles where id=(select id from t where label='a3')),1,'editor reads submitted drafts');
select is((select count(*)::integer from public.list_review_articles()),2,'review queue: one submission plus own publication');
reset role;
insert into public.articles(owner_profile_id,section_id,title,slug,status,
  review_requested_at,published_at,published_by_profile_id)
select a.owner_profile_id,a.section_id,'Queue fixture '||n,'queue-fixture-'||n,
  case when n <= 51 then 'draft'::public.article_status else 'published'::public.article_status end,
  case when n <= 51 then now() + n * interval '1 day' end,
  case when n > 51 then now() + n * interval '1 day' end,
  case when n > 51 then (select id from public.profiles
    where auth_user_id='00000000-0000-0000-0000-000000000003') end
from public.articles a cross join generate_series(1,102) n
where a.id=(select id from t where label='a3');
set local role authenticated;
select is((select count(*) from public.list_review_articles() where status='draft'),
  50::bigint,'pending drafts have their own cap');
select is((select count(*) from public.list_review_articles() where status='published'),
  50::bigint,'a full draft queue leaves room for publications');
select is((select title from public.list_review_articles() where status='published' limit 1),
  'Queue fixture 102','the newest own publication appears first');
reset role;
select pg_temp.act_as('2'); set local role authenticated;
select throws_ok('select * from public.list_review_articles()','42501',null,'authors cannot open the review queue');
reset role;
select ok(not has_function_privilege('authenticated','private.article_authority(uuid,uuid,text)','EXECUTE'),'authority helper is private');
select pg_temp.act_as('4'); set local role authenticated;
select is((select editors from public.staff_summary()),(select count(*)::integer from public.memberships where active and role='editor'),'staff summary counts editors');
reset role;
-- An article that was submitted, published by an administrator, then archived is
-- not readable by editors through the private table (they read only what is in review or what they published).
select is(pg_temp.call('4','publish','a3')->>'ok','true','administrator publishes the submitted article');
select is(pg_temp.call('4','archive','a3')->>'ok','true','administrator archives it');
select ok(not exists(
  select 1 from jsonb_array_elements(public.list_public_sitemap_articles(null,null,100)->'items') item
  where item->>'id'=(select id::text from t where label='a3')),
  'checked archive transition removes article from sitemap');
select is(pg_temp.call('3','restore','a3')->>'code','not_found','editor cannot restore another publisher''s archived article');
select pg_temp.act_as('3'); set local role authenticated;
select is((select count(*)::integer from public.articles where id=(select id from t where label='a3')),0,
  'an editor cannot read an archived article they did not publish');
reset role;
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000002';
select pg_temp.act_as('2');
set local role authenticated;
select is((select public.save_article_draft(id,edit_version,request_id,pg_temp.draft_input(pg_temp.body())) from saved_before_submit)->>'code','forbidden','revocation denies replay');
reset role;
select * from finish();
rollback;
