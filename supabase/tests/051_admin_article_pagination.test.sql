begin;
select plan(7);

update auth.users set email='pagination-'||right(id::text,1)||'@bc.edu',
  email_confirmed_at=now(), raw_app_meta_data='{"provider":"google","providers":["google"]}'
where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
insert into public.sections(id,name,slug,active) values
('20000000-0000-4000-8000-000000000091','Pagination Section','pagination-section',true);
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at,updated_at)
select ('89000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
case when n%2=0 then '10000000-0000-0000-0000-000000000002' else '10000000-0000-0000-0000-000000000003' end::uuid,
'20000000-0000-4000-8000-000000000091'::uuid,
'Pagination '||n,'pagination-'||n,
case n when 1 then 'draft' when 2 then 'published' else 'archived' end::public.article_status,
case when n>1 then '2026-01-01'::timestamptz end,
case when n>2 then '2026-02-01'::timestamptz end,
case when n=1 then '2026-03-01' else '2026-03-02' end::timestamptz
from generate_series(1,4) n;

select ok(exists(select 1 from pg_index where indexrelid='public.articles_updated_page_idx'::regclass
  and indisvalid and indpred is null and not indisunique),
  'pagination index covers every status without changing uniqueness');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select results_eq($$ select right(id::text,1) from public.articles
  where section_id='20000000-0000-4000-8000-000000000091'
  order by updated_at desc,id desc limit 2 $$,
  $$ values ('4'::text),('3'::text) $$,'administrator page uses descending UUID to break timestamp ties');
select results_eq($$ select right(id::text,1) from public.articles
  where section_id='20000000-0000-4000-8000-000000000091'
    and (updated_at<'2026-03-02'::timestamptz or (updated_at='2026-03-02'::timestamptz and id<'89000000-0000-4000-8000-000000000003'::uuid))
  order by updated_at desc,id desc limit 2 $$,
  $$ values ('2'::text),('1'::text) $$,'continuation includes the remaining tie then the older row without repeating its cursor');
select is((select count(distinct status)::int from public.articles where section_id='20000000-0000-4000-8000-000000000091'),3,
  'broad administrator listing includes draft published and archived rows');
select results_eq($$ select right(id::text,1) from public.articles
  where section_id='20000000-0000-4000-8000-000000000091' and status='published'
  order by updated_at desc,id desc $$,$$ values ('2'::text) $$,'status filtering remains exact');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select results_eq($$ select right(id::text,1) from public.articles
  where section_id='20000000-0000-4000-8000-000000000091'
  order by updated_at desc,id desc $$,$$ values ('4'::text),('2'::text) $$,
  'index-backed ordering does not expose another owners rows');
reset role;
set local role anon;
select throws_ok($$ select id from public.articles order by updated_at desc,id desc limit 2 $$,
  '42501',null,'anonymous article-table reads remain denied');
reset role;
select * from finish();
rollback;
