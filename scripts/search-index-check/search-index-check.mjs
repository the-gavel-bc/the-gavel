import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Fixed synthetic namespace and rollback protect the owner's existing local data.
const container = process.env.SEARCH_CHECK_CONTAINER;
assert.match(
  container ?? "",
  /^supabase_db_gavel-task16-(upgrade|clean)$/,
  "Use a disposable Task 16 database; this benchmark is not for the working project.",
);
const sql = `
\\set ON_ERROR_STOP on
begin;
set local statement_timeout='60s';
do $$ begin
 if exists(select 1 from public.sections where slug like 'search-bench-%')
   or exists(select 1 from public.profiles where slug like 'search-bench-%')
   or exists(select 1 from public.tags where slug like 'search-bench-%')
 then raise exception 'Search benchmark fixture collision'; end if;
end $$;
insert into public.profiles(id,display_name,slug)
 select ('1c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case n when 2000 then 'Profileneedle' when 1999 then 'Writerneedle' else 'Corpusowner '||n end,'search-bench-owner-'||n
 from generate_series(1,2000) n;
insert into public.sections(id,name,slug)
 select ('2c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case n when 100 then 'Sectionneedle' else 'Corpussection '||n end,'search-bench-section-'||n
 from generate_series(1,100) n;
insert into public.categories(id,section_id,name,slug)
 select ('3c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case n when 1000 then '2c000000-0000-0000-0000-000000000100'::uuid else '2c000000-0000-0000-0000-000000000001'::uuid end,case n when 1000 then 'Categoryneedle' else 'Corpuscategory '||n end,'search-bench-category-'||n
 from generate_series(1,1000) n;
insert into public.tags(id,name,slug)
 select ('4c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case n when 2000 then 'Tagneedle' else 'Corpustag '||n end,'search-bench-tag-'||n
 from generate_series(1,2000) n;
insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at)
 select ('5c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case n when 10000 then '1c000000-0000-0000-0000-000000002000'::uuid else '1c000000-0000-0000-0000-000000000001'::uuid end,
 case n when 10000 then '2c000000-0000-0000-0000-000000000100'::uuid else '2c000000-0000-0000-0000-000000000001'::uuid end,
 'Corpuscommon story '||n,'search-bench-story-'||n,
 jsonb_build_object('format','gavel-draft','version',1,'document',jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',case n when 10000 then 'Corpuscommon corpusneedle' else 'Corpuscommon body' end)))))),
 'published','2026-11-10T00:00:00Z'::timestamptz+n*interval '1 microsecond'
 from generate_series(1,10000) n;
insert into public.article_categories(article_id,category_id,section_id) select ('5c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('3c000000-0000-0000-0000-'||lpad((case when n=10000 then 1000 else n%999+1 end)::text,12,'0'))::uuid,case when n=10000 then '2c000000-0000-0000-0000-000000000100'::uuid else '2c000000-0000-0000-0000-000000000001'::uuid end from generate_series(1,10000) n;
insert into public.article_tags select ('5c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('4c000000-0000-0000-0000-'||lpad((case when n=10000 then 2000 else n%1999+1 end)::text,12,'0'))::uuid from generate_series(1,10000) n;
insert into public.article_contributors(article_id,profile_id,contribution_role) select ('5c000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,case n when 10000 then '1c000000-0000-0000-0000-000000001999'::uuid else '1c000000-0000-0000-0000-000000000001'::uuid end,'writer' from generate_series(1,10000) n;
analyze public.articles; analyze public.profiles; analyze public.sections;
analyze public.categories; analyze public.tags; analyze public.article_contributors;
analyze public.article_categories; analyze public.article_tags;
create function pg_temp.explain(q text) returns jsonb language plpgsql as $$ declare p jsonb; begin
 execute 'explain (analyze,buffers,format json) '||q into p; return p->0; end $$;
create function pg_temp.candidate_plan(words text[]) returns jsonb language plpgsql as $$ declare q text; begin
 select substring(prosrc from '(?s)return query\\s*(.*);\\s*end;') into q from pg_proc
   where oid='private.search_article_candidates(text[],integer,timestamptz,uuid)'::regprocedure;
 if q is null then raise exception 'Candidate plan extraction no longer matches; update verification'; end if;
 q:=replace(q,'p_terms',format('%L::text[]',words)); q:=replace(q,'p_limit','25');
 q:=replace(q,'p_before_at','null::timestamptz'); q:=replace(q,'p_before_id','null::uuid');
 return pg_temp.explain(q); end $$;
set local statement_timeout='2s';
create temp table search_plans(label text,plan jsonb);
insert into search_plans values
 ('body',pg_temp.candidate_plan(array['corpusneedle'])),
 ('cross-field',pg_temp.candidate_plan(array['corpusneedle','profileneedle'])),
 ('live-taxonomy',pg_temp.candidate_plan(array['writerneedle','sectionneedle','categoryneedle','tagneedle'])),
 ('common',pg_temp.candidate_plan(array['corpuscommon']));
do $$ begin for n in 1..8 loop perform article_id from private.search_article_candidates(case when n%2=0 then array['corpuscommon'] else array['corpusneedle'] end); end loop; end $$;
insert into search_plans values('function-common',pg_temp.explain($q$select * from private.search_article_candidates(array['corpuscommon'])$q$));
select jsonb_build_object('rows',10000,'plans',(select jsonb_agg(jsonb_build_object('label',label,'plan',plan)) from search_plans),
 'rareCount',(select count(*) from private.search_article_candidates(array['corpusneedle'])),
 'crossCount',(select count(*) from private.search_article_candidates(array['corpusneedle','profileneedle'])),
 'commonCount',(select count(*) from private.search_article_candidates(array['corpuscommon'])));
rollback;
`;
let raw;
try {
  raw = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XAtq",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
} finally {
  // ANALYZE statistics can outlive a rolled-back fixture transaction. Restore
  // planner statistics even when a plan timeout aborts the benchmark.
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XAtq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input:
        "analyze public.articles; analyze public.profiles; analyze public.sections; analyze public.categories; analyze public.tags; analyze public.article_contributors; analyze public.article_categories; analyze public.article_tags;",
      encoding: "utf8",
    },
  );
}
const result = JSON.parse(raw.trim());
assert.equal(result.rareCount, 1);
assert.equal(result.crossCount, 1);
assert.equal(result.commonCount, 25);
function indexes(node, names = new Set()) {
  if (node["Index Name"]) names.add(node["Index Name"]);
  for (const child of node.Plans ?? []) indexes(child, names);
  return names;
}
const summaries = result.plans.map(({ label, plan }) => {
  assert.ok(
    plan["Execution Time"] < 1000,
    `${label} exceeded synthetic 1s budget`,
  );
  return {
    label,
    milliseconds: plan["Execution Time"],
    indexes: [...indexes(plan.Plan)],
  };
});
assert.ok(
  summaries.some((s) =>
    s.indexes.includes("articles_published_search_words_idx"),
  ),
  "Unforced plans must use article GIN",
);
assert.ok(
  summaries.some((s) => s.indexes.includes("profiles_active_search_words_idx")),
  "Unforced plans must use profile GIN",
);
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({ rows: result.rows, summaries, rolledBack: true }, null, 2),
);
