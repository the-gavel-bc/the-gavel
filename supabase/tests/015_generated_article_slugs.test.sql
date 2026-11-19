begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc

create temp table results(label text primary key, result jsonb);
grant select,insert on results to authenticated;
set local role authenticated;
insert into results values
  ('legacy', public.create_article_draft('80000000-0000-0000-0000-000000000301',pg_temp.draft_input('{"title":"Legacy Compatibility","slug":"chosen-path"}'))),
  ('first', public.create_article_draft('80000000-0000-0000-0000-000000000302',pg_temp.draft_input() - 'slug')),
  ('second', public.create_article_draft('80000000-0000-0000-0000-000000000303',pg_temp.draft_input() - 'slug'));
reset role;

select is((select result->>'ok' from results where label='legacy'),'true','old payload shape remains writable during rollout');
select is((select slug from public.articles where id=(select (result->>'articleId')::uuid from results where label='legacy')),'legacy-compatibility','database ignores old supplied slug');
select is((select result->>'ok' from results where label='first'),'true','draft creates without slug');
select is((select result->>'ok' from results where label='second'),'true','same title creates another draft');
select is((select slug from public.articles where id=(select (result->>'articleId')::uuid from results where label='first')),'synthetic-draft','first title takes base slug');
select is((select slug from public.articles where id=(select (result->>'articleId')::uuid from results where label='second')),'synthetic-draft-2','second title gets numeric suffix');
select is((select count(*)::integer from public.articles),3,'each accepted request creates one article');
select is((select count(*)::integer from public.article_revisions),3,'each accepted request creates one revision');
select is((select count(*)::integer from private.draft_write_receipts),3,'each accepted request creates one receipt');
select is((select result->>'replayed' from results where label='first'),'false','first result is a new write');
select is(public.create_article_draft('80000000-0000-0000-0000-000000000302',pg_temp.draft_input() - 'slug')->>'replayed','true','exact retry replays generated slug write');
select is(private.article_slug_base('Café & Beyond'),'cafe-beyond','Latin accent and punctuation normalize in the database');
select is(private.article_slug_base('東京 📰'),'article','non-ASCII-only title uses deterministic fallback');
select is(char_length(private.article_slug_base(repeat('a',240))),180,'base slug stays within column bound');
select is(char_length(private.allocate_article_slug(repeat('a',240))),180,'allocated slug stays within column bound');
select ok(not has_function_privilege('authenticated','private.article_slug_base(text)','EXECUTE'),'normalizer is not directly callable by application roles');
select ok(not has_function_privilege('authenticated','private.allocate_article_slug(text,uuid)','EXECUTE'),'allocator is not directly callable by application roles');
select is(public.save_article_draft((select (result->>'articleId')::uuid from results where label='first'),1,
  '80000000-0000-0000-0000-000000000304',pg_temp.draft_input('{"title":"Café & Beyond"}'))->>'ok','true','draft title change saves without a slug');
select is((select slug from public.articles where id=(select (result->>'articleId')::uuid from results where label='first')),'cafe-beyond','draft slug follows edited title');
select is(public.save_article_draft((select (result->>'articleId')::uuid from results where label='first'),2,
  '80000000-0000-0000-0000-000000000305',pg_temp.draft_input('{"title":"Second Title","slug":"forged"}'))->>'ok','true','old save payload remains writable during rollout');
select is((select slug from public.articles where id=(select (result->>'articleId')::uuid from results where label='first')),'second-title','old save payload cannot choose the slug');
select is(public.save_article_draft((select (result->>'articleId')::uuid from results where label='first'),3,
  '80000000-0000-0000-0000-000000000310',pg_temp.draft_input('{"title":"Third Title","slug":99}'))->>'code','invalid_input','malformed old slug is rejected');
update public.articles set status='published',published_at=now() where id=(select (result->>'articleId')::uuid from results where label='first');
select is(public.save_article_draft((select (result->>'articleId')::uuid from results where label='first'),3,
  '80000000-0000-0000-0000-000000000306',pg_temp.draft_input('{"title":"New public title"}'))->>'code','not_found','draft save cannot change a published article');
select is((select slug from public.articles where id=(select (result->>'articleId')::uuid from results where label='first')),'second-title','published slug remains fixed');

insert into public.articles(id,owner_profile_id,section_id,title,slug)
values('50000000-0000-0000-0000-000000000301','10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000051','Legacy Title','legacy-custom');
insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,payload_hash,result_version,result_updated_at,changed)
select auth.uid(),'80000000-0000-0000-0000-000000000307','create',
  '50000000-0000-0000-0000-000000000301',
  private.draft_request_hash('create',null,null,
    private.check_draft_input_with_slug(pg_temp.draft_input('{"title":"Legacy Title","slug":"legacy-custom"}')) -> 'value'),
  1,(select updated_at from public.articles where id='50000000-0000-0000-0000-000000000301'),true;
select is(public.create_article_draft('80000000-0000-0000-0000-000000000307',
  pg_temp.draft_input('{"title":"Legacy Title","slug":"legacy-custom"}'))->>'replayed','true','old exact receipt remains replayable');
select is(public.create_article_draft('80000000-0000-0000-0000-000000000307',
  pg_temp.draft_input('{"title":"Legacy Title","slug":"chosen"}'))->>'code','request_conflict','old receipt cannot authorize a changed slug');
select is(public.create_article_draft('80000000-0000-0000-0000-000000000308',
  pg_temp.draft_input('{"title":"Legacy Title","slug":"legacy-custom"}'))->>'ok','true','old payload shape creates a generated slug, never the chosen slug');
select is((select slug from public.articles where title='Legacy Title' and slug<>'legacy-custom'),'legacy-title','old title gets generated slug');
select is(public.create_article_draft('80000000-0000-0000-0000-000000000309',
  pg_temp.draft_input('{"title":"Legacy Custom"}'))->>'ok','true','legacy stored slug remains reserved');
select is((select slug from public.articles where title='Legacy Custom'),'legacy-custom-2','new title cannot take an existing manually chosen slug');

select * from finish();
rollback;
