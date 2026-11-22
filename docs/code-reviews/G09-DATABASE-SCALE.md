# G-09 dashboard database scale measurement

November 22, 2026. Measured on the disposable local Supabase database with the Batch 3 review queue split already applied. The transaction added 50,000 synthetic articles, split equally between published stories and drafts. Twenty published titles contained `Sparrow`, 250 drafts were submitted, and 126 publications belonged to the administrator's profile. The administrator probes used the `authenticated` role and a synthetic administrator identity. The review branch probes ran as the function owner to match the security-definer query context.

These are single local runs with warm buffers. The administrator queries measure the article scan and pagination order. They omit PostgREST serialization, relationship expansion, and application latency. The review timings measure the inner branches with their joins. They omit the RPC authentication check and outer union.

| Probe | Current indexes | Candidate indexes | Observed plan |
| --- | ---: | ---: | --- |
| Administrator first page, 21 rows | 6.9 ms | 7.6 ms | `articles_updated_page_idx` stops after 21 rows |
| Administrator rare title, published only | 6,672 ms | 8,341 ms | Publication index and heap scan filter 25,000 rows under RLS |
| Administrator title with no matches | 13,593 ms | 15,278 ms | Sequential scan filters 50,000 rows under RLS |
| Oldest 50 submitted drafts | 0.39 ms | 0.64 ms | `articles_review_queue_idx` limits the draft scan |
| Latest 50 publications by the caller | 7.76 ms | 0.20 ms | The candidate index bounds the scan to 50 rows |

The title index did not appear in either authenticated search plan. Both plans applied `private.can_read_article(id)` and the title regex in the filter. The experiment establishes that adding a trigram index alone leaves the expensive plan in place on this setup. The measured bottleneck is the administrator title query. Any follow-up that changes its query boundary needs role, ownership, pagination, and literal title-matching tests. The existing draft branch already uses its partial index. The publication index has a measurable local benefit and would add write overhead. No application query, policy, or index changed in this measurement.

## Reproduce on a disposable database

Run the SQL with `psql -X -v ON_ERROR_STOP=1` against a migrated local test database. The transaction rolls back the fixtures. Both runs returned zero matching fixture articles after rollback.

```sql
begin;
set local statement_timeout = '45s';
insert into public.sections(id, name, slug)
values ('c7000000-0000-0000-0000-000000000001','Synthetic scale section','synthetic-scale-section');
update auth.users set email='review-scale-admin@bc.edu', email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'
where id='00000000-0000-0000-0000-000000000004';

insert into public.articles(
  owner_profile_id, section_id, title, slug, status, updated_at, published_at,
  published_by_profile_id, review_requested_at
)
select '10000000-0000-0000-0000-000000000002',
  'c7000000-0000-0000-0000-000000000001',
  case when n%2500=1 then 'Sparrow desk scale ' else 'Ordinary desk scale ' end || n,
  'synthetic-desk-scale-' || n,
  (case when n%2=1 then 'published' else 'draft' end)::public.article_status,
  '2090-01-01'::timestamptz + n*interval '1 second',
  case when n%2=1 then '2090-01-01'::timestamptz + n*interval '1 second' end,
  case when n%199=1 and n%2=1 then '10000000-0000-0000-0000-000000000004'::uuid end,
  case when n%200=0 then '2090-01-01'::timestamptz + n*interval '1 second' end
from generate_series(1,50000) n;
analyze public.articles;

\echo ADMIN_FIRST_PAGE
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
explain (analyze,buffers,timing off) select id,title from public.articles order by updated_at desc,id desc limit 21;
\echo ADMIN_TITLE_HIT
explain (analyze,buffers,timing off) select id,title from public.articles
  where status='published' and title ~* 'Sparrow' order by updated_at desc,id desc limit 21;
\echo ADMIN_TITLE_MISS
explain (analyze,buffers,timing off) select id,title from public.articles
  where title ~* 'NoSuchDeskScaleTitle' order by updated_at desc,id desc limit 21;
reset role;
\echo REVIEW_DRAFT_BRANCH
explain (analyze,buffers,timing off)
select a.id from public.articles a
join public.profiles o on o.id=a.owner_profile_id
join public.sections s on s.id=a.section_id
where a.status='draft' and a.review_requested_at is not null
order by a.review_requested_at,a.id limit 50;
\echo REVIEW_PUBLISHED_BRANCH
explain (analyze,buffers,timing off)
select a.id from public.articles a
join public.profiles o on o.id=a.owner_profile_id
join public.sections s on s.id=a.section_id
where a.status='published' and a.published_by_profile_id='10000000-0000-0000-0000-000000000004'
order by a.published_at desc,a.id desc limit 50;
rollback;
select count(*) from public.articles where slug like 'synthetic-desk-scale-%';
```

To compare candidate indexes, insert the following statements immediately before `analyze public.articles` in the same transaction. They roll back with the fixtures.

```sql
create extension if not exists pg_trgm with schema extensions;
create index synthetic_desk_title_trgm on public.articles
  using gin (title extensions.gin_trgm_ops);
create index synthetic_desk_review_publications on public.articles
  (published_by_profile_id, published_at desc, id desc) where status='published';
```
