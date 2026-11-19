begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
create temp table target as select (public.create_article_draft(gen_random_uuid(),pg_temp.draft_input())->>'articleId')::uuid id;
create function pg_temp.try_save(patch jsonb default '{}',v integer default 1) returns jsonb language sql as $$
select public.save_article_draft((select id from target),v,gen_random_uuid(),pg_temp.draft_input(patch));
$$;
update public.articles set status='published',published_at=now();
select is(pg_temp.try_save('{"title":"No publish edit"}')->>'code','not_found','an author cannot edit a published article');
update public.articles set status='archived',archived_at=now();
select is(pg_temp.try_save()->>'code','not_found','an author cannot edit an archived article');
update public.articles set status='draft',published_at=null,archived_at=null,content='{"legacy":"original"}';
select is(pg_temp.try_save('{"title":"Metadata only"}')->>'code','unsupported_content','unsupported stored content blocks even metadata-only overwrite');
select is((select content from public.articles),'{"legacy":"original"}'::jsonb,'original unsupported content preserved');
update public.articles set content=null,edit_version=2147483647;
select is(pg_temp.try_save('{"title":"Exhausted"}',2147483647)->>'code','conflict','version exhaustion fails without overflow');
select is((select edit_version from public.articles),2147483647,'failed exhausted save preserves version');
select is(pg_temp.try_save('{}',2147483647)->>'changed','false','no-op needs no version increment even at integer maximum');
select is((select count(*)::integer from public.article_revisions),1,'wrong-status/legacy/exhaustion/no-op calls add no revisions');
select is((select count(*)::integer from public.audit_events),1,'wrong-status/legacy/exhaustion/no-op calls add no audits');
select * from finish();
rollback;
