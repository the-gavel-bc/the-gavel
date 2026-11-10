begin;
select no_plan();
select has_function('private','canonical_search_text',array['jsonb'],'private canonical extractor exists');
select is(private.canonical_search_text(null),'','NULL body contributes no text');
select is(private.canonical_search_text('{"legacy":"hidden token"}'),'','legacy JSON never becomes searchable text');
select is(private.canonical_search_text('{"format":"gavel-draft","version":99,"document":{"type":"doc","content":[]}}'),'','unknown versions contribute no body text');
create temp table search_text_proof(body jsonb);
insert into search_text_proof values ('{"format":"gavel-draft","version":2,"document":{"type":"doc","content":[
 {"type":"paragraph","content":[{"type":"text","text":"Report"},{"type":"text","text":"ing","marks":[{"type":"bold"}]},{"type":"hardBreak"},{"type":"text","text":"link label","marks":[{"type":"link","attrs":{"href":"https://example.com/hiddenurl"}}]}]},
 {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Heading"}]},
 {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Quote"}]}]},
 {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"List item"}]}]}]},
 {"type":"image","attrs":{"assetId":"61000000-0000-0000-0000-000000000043","alt":"hiddenalt","caption":"Public caption"}}
 ]}}');
select ok(private.is_valid_draft_document((select body from search_text_proof)),'fixture is supported canonical v2');
select is(private.canonical_search_text((select body from search_text_proof)),E'\nReporting\nlink label\nHeading\n\nQuote\n\n\nList item\nPublic caption\n','text order, inline joins and structural boundaries preserved');
select ok(private.article_search_lexemes('Public title','Excerpt phrase','Meta description',(select body from search_text_proof)) @> array['public','title','excerpt','meta','description','reporting','heading','quote','list','caption'],'allowed article fields and body captions searchable');
select ok(not (private.article_search_lexemes('Public title',null,null,(select body from search_text_proof)) && array['hiddenurl','hiddenalt','assetid','blockquote','bold']),'attributes, JSON keys and marks never enter the index');
select is(private.search_lexemes('The MAY reporting REPORTING'),array['may','reporting','the'],'simple normalization deduplicates without English stop words/stemming');
select is(private.article_search_lexemes('Title',null,null,'{"raw":"hiddenlegacy"}'),array['title'],'safe metadata remains searchable when legacy body is unsupported');
select is(private.search_lexemes(null),array[]::text[],'NULL text has no words');
-- A valid canonical body can exceed the native single-tsvector limit. Its tail
-- must survive indexing rather than failing a save or silently truncating text.
create temp table large_search_proof(body jsonb,words text);
insert into large_search_proof(words) select string_agg('w'||lpad(n::text,6,'0'),' ' order by n) from generate_series(1,120000) n;
update large_search_proof set body=jsonb_build_object('format','gavel-draft','version',1,'document',jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',words))))));
update large_search_proof set body=jsonb_set(body,'{document,content,0,content,0,text}',to_jsonb(words||repeat(' w000001',(1048576-octet_length(body::text))/8)||repeat(' ',(1048576-octet_length(body::text))%8)));
select is(octet_length((select body from large_search_proof)::text),1048576,'high-vocabulary body reaches exact 1 MiB boundary');
select ok(private.is_valid_draft_document((select body from large_search_proof)),'high-vocabulary fixture remains within canonical limits');
select throws_ok($$ select to_tsvector('pg_catalog.simple',(select words from large_search_proof)) $$,'54000',null,'fixture exceeds native vector limit');
select is(cardinality(private.article_search_lexemes('Large',null,null,(select body from large_search_proof))),120001,'large valid document retains every distinct word');
select ok(private.article_search_lexemes('Large',null,null,(select body from large_search_proof)) @> array['w000001','w120000'],'large document tail is not truncated');
select ok(private.search_lexemes('MAY cross-field naïve '||(select words from large_search_proof)) @> private.search_lexemes('MAY cross-field naïve'),'immutable large-document path preserves native compound and Unicode normalization');
insert into public.sections(id,name,slug) values('2a000000-0000-0000-0000-000000000043','Large search proof','large-search-proof');
create temp table large_write_clock as select clock_timestamp() started;
select lives_ok($q$ insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at)
 select '5a000000-0000-0000-0000-000000000043','10000000-0000-0000-0000-000000000002','2a000000-0000-0000-0000-000000000043','Large boundary proof','large-search-proof',body,'published',now() from large_search_proof $q$,'exact 1 MiB body can maintain the published GIN index');
select diag('Exact 1 MiB indexed insert milliseconds: '||round((extract(epoch from(clock_timestamp()-(select started from large_write_clock)))*1000)::numeric,2));
set local enable_seqscan=off;
select is((select count(*)::int from public.articles a where status='published' and private.article_search_lexemes(a.title,a.excerpt,a.meta_description,a.content) @> array['w120000']),1,'GIN contains tail lexeme of maximum-size body');
set local enable_seqscan=on;
select ok(not has_function_privilege('anon','private.canonical_search_text(jsonb)','execute'),'anonymous cannot call extractor');
select ok(not has_function_privilege('authenticated','private.search_lexemes(text)','execute'),'authenticated cannot call private normalizer');
select ok(not has_function_privilege('anon','private.article_search_lexemes(text,text,text,jsonb)','execute'),'no direct public article-index helper');
select * from finish();
rollback;
