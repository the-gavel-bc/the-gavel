begin;
select no_plan();
-- Every application-callable function that touches article content or media must
-- decide access through private.article_authority, and none may fall back to the
-- old inline "owner or administrator" test (a later migration copying an older
-- function body would reintroduce it).
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and p.proname not in ('capture_draft_snapshot','article_authority','guard_published_profile_references')
    and pg_get_functiondef(p.oid) ~ 'owner_profile_id *(=|<>) *actor'),0,
  'no function compares the owner to the actor inline');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('save_article_draft','save_published_article',
    'request_article_image_upload','mark_article_image_for_removal','admit_article_image_upload',
    'list_unused_article_uploads','set_article_main_image','finalize_article_image_upload',
    'complete_article_image_removal','begin_article_image_upload')
    and pg_get_functiondef(p.oid) !~ 'article_authority'),0,
  'article write and media functions all use article_authority');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='transition_article' and pg_get_functiondef(p.oid) !~ 'article_authority'),0,
  'the lifecycle function uses article_authority');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('admit_article_image_upload','begin_article_image_upload','finalize_article_image_upload')
    and pg_get_functiondef(p.oid) !~ 'can_use_asset'),0,
  'the uploader-or-administrator rule has one source');
select ok(not has_function_privilege('authenticated','private.article_authority(uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('anon','private.article_authority(uuid,uuid,text)','EXECUTE'),
  'the authority predicate is not callable by application roles');
select ok(not has_function_privilege('authenticated','private.can_use_asset(uuid,uuid)','EXECUTE'),
  'the asset rule is not callable by application roles');
select * from finish();
rollback;
