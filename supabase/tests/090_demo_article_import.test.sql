begin;
select no_plan();
-- 2 = author, 4 = administrator.
create function pg_temp.payload(src text, art text, extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('sourceId',src,'articleId',art,'status','published','slug','demo-import-story',
    'title','Demo import story','excerpt',null,'content',
    '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Body ","marks":[]},{"type":"text","text":"link","marks":[{"type":"link","attrs":{"href":"https://example.com/a"}}]}]}]}}'::jsonb,
    'section',(select slug from public.sections where active order by slug limit 1),'categories','[]'::jsonb,
    'tags','["Demo Import Tag"]'::jsonb,'writer','Demo Writer Name','publishedAt','2026-03-04T15:00:00Z',
    'correction','An earlier version misspelled a name.','correctedAt','2026-03-05T15:00:00Z') || extra;
$$;
create function pg_temp.run(actor text, p jsonb, dry boolean default false, img jsonb default null) returns jsonb language sql as $$
  select public.import_demo_article(('00000000-0000-0000-0000-00000000000'||actor)::uuid, p, img, dry);
$$;

select ok(not has_function_privilege('anon','public.import_demo_article(uuid,jsonb,jsonb,boolean)','EXECUTE')
  and not has_function_privilege('authenticated','public.import_demo_article(uuid,jsonb,jsonb,boolean)','EXECUTE'),
  'application roles cannot import');
select ok(has_function_privilege('service_role','public.import_demo_article(uuid,jsonb,jsonb,boolean)','EXECUTE'),'the service role can');
select ok(not has_table_privilege('authenticated','private.demo_import_ledger','SELECT'),'ledger is private');

select is(pg_temp.run('2',pg_temp.payload('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001'))->>'code',
  'forbidden','an author cannot be the actor');

-- Dry run checks everything and writes nothing.
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001'),true)->>'dryRun',
  'true','dry run succeeds');
select is((select count(*)::int from public.articles where id='91000000-0000-4000-8000-000000000001'),0,'dry run left no article');
select is((select count(*)::int from private.demo_import_ledger where source_id='90000000-0000-4000-8000-000000000001'),0,'or ledger row');

-- Real import.
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001'))->>'ok','true','imports');
select is((select status::text||'|'||publication_date::text from public.articles where id='91000000-0000-4000-8000-000000000001'),
  'published|2026-03-04','published with its original date');
select is((select correction from public.articles where id='91000000-0000-4000-8000-000000000001'),
  'An earlier version misspelled a name.','correction carried over');
select is((select p.display_name from public.article_contributors c join public.profiles p on p.id=c.profile_id
  where c.article_id='91000000-0000-4000-8000-000000000001' and c.contribution_role='writer'),'Demo Writer Name','one-off writer credit');
select is((select p.auth_user_id from public.articles a join public.profiles p on p.id=a.owner_profile_id
  where a.id='91000000-0000-4000-8000-000000000001'),null,'owned by the archive profile, not a person');
select is((select count(*)::int from public.article_tags at join public.tags t on t.id=at.tag_id
  where at.article_id='91000000-0000-4000-8000-000000000001' and t.name='Demo Import Tag'),1,'tag created and linked');
select is((select count(*)::int from public.audit_events where resource_id='91000000-0000-4000-8000-000000000001'
  and action in ('article.created','article.published')),2,'audited');
select is((select count(*)::int from public.article_revisions where article_id='91000000-0000-4000-8000-000000000001'),1,'revision captured');
set local role anon;
select is(public.get_public_article('demo-import-story')->'article'->>'title','Demo import story','readers can open it');
reset role;

-- Re-runs.
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000009'))->>'skipped',
  'true','the same source again is skipped, whatever new id the script chose');
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000009','{"title":"Changed"}'))->>'code',
  'changed_since_import','a changed source is reported, not overwritten');

-- A second article: same slug and same writer.
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002'))->>'slugChanged',
  'true','a slug clash gets a suffix');
select is((select count(*)::int from public.profiles where display_name='Demo Writer Name'),1,'the same byline reuses one credit');

-- Drafts arrive in review.
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000003',
  '{"status":"draft","correction":null,"correctedAt":null}'))->>'ok','true','draft imports');
select ok((select status='draft' and review_requested_at is not null and published_at is null
  from public.articles where id='91000000-0000-4000-8000-000000000003'),'draft is in review');

-- Refusals.
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000004',
  '{"section":"no-such-section"}'))->>'code','invalid_input','unknown section refused');
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000004',
  '{"categories":["no-such-category"]}'))->>'code','invalid_input','unknown category refused');
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000004',
  '{"content":{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"href":"javascript:alert(1)"}}]}]}]}}}'))->>'code',
  'invalid_input','unsafe link refused by the editor validator');
select is(pg_temp.run('4',pg_temp.payload('90000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000004'),false,
  '{"assetId":"92000000-0000-4000-8000-000000000004","objectKey":"elsewhere/x.webp","byteSize":10,"width":10,"height":10,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","alt":"Alt","credit":"Credit","caption":null}'::jsonb)->>'code',
  'invalid_input','an image path outside the article is refused');
select is((select count(*)::int from public.articles where id='91000000-0000-4000-8000-000000000004'),0,'nothing written for refused articles');
select * from finish();
rollback;
