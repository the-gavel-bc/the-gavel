begin;
select no_plan();
select has_function('public','get_public_read_this',array[]::text[],'narrow footer projection exists');
select is((select provolatile::text from pg_proc where oid='public.get_public_read_this()'::regprocedure),'s','footer uses a stable statement snapshot');
select ok(has_function_privilege('anon','public.get_public_read_this()','execute'),'anonymous may read footer');
select ok(has_function_privilege('authenticated','public.get_public_read_this()','execute'),'authenticated may read identical footer');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.get_public_read_this()'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC has no implicit execution grant');
select ok(not has_function_privilege('anon','private.resolve_homepage_slots()','execute'),'anonymous cannot invoke private resolver');
select ok(not has_function_privilege('authenticated','private.homepage_card_map(uuid[])','execute'),'authenticated cannot invoke private card projection');
update public.articles set status='archived',archived_at=now() where status='published';
delete from public.homepage_selections;
set local role anon;
select is(public.get_public_read_this(),'{"kind":"ok","readThis":[]}'::jsonb,'empty catalog has no fabricated footer stories');
select throws_ok($$ select * from public.homepage_selections $$,'42501',null,'public footer does not grant private curation reads');
select throws_ok($$ select public.get_admin_homepage_curation() $$,'42501',null,'administrator preview remains private');
reset role;
insert into public.sections(id,name,slug) values('29000000-0000-0000-0000-000000000049','Footer proof','footer-proof');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
select ('59000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '10000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000049',
 'Footer story '||n,'footer-story-'||n,'published','2026-11-01T00:00:00.123456Z'
from generate_series(1,12) n;
insert into public.articles(owner_profile_id,section_id,title,slug)
values('10000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000049','Private footer draft','footer-private-draft');
insert into public.homepage_selections values
 ('lead',1,'59000000-0000-0000-0000-000000000001'),
 ('featured',1,'59000000-0000-0000-0000-000000000003'),
 ('featured',2,'59000000-0000-0000-0000-000000000002'),
 ('read_this',1,'59000000-0000-0000-0000-000000000012');
create temporary table footer_proof(value jsonb);
grant select,insert on footer_proof to anon,authenticated;
set local role anon;
insert into footer_proof select public.get_public_read_this();
select is((select value#>>'{readThis,0,slug}' from footer_proof),'footer-story-12','curated footer order is preserved');
select is((select value#>>'{readThis,1,slug}' from footer_proof),'footer-story-9','fallback reserves lead and featured slots');
select is((select value->'readThis' from footer_proof),public.get_public_homepage()->'readThis','narrow and full composition use identical cards');
select is((select jsonb_array_length(value->'readThis') from footer_proof),4,'footer bounded at four cards');
select is((select count(*)::integer from footer_proof f cross join lateral jsonb_object_keys(f.value) k),2,'only kind and readThis top-level fields are returned');
select ok((select value::text from footer_proof) !~ 'edit_version|saved|object_key|auth_user_id|content|footer-private-draft','private fields, body and draft stay hidden');
select is((select count(distinct c->>'id')::integer from footer_proof f cross join lateral jsonb_array_elements(f.value->'readThis') c),4,'footer cards are unique');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.get_public_read_this(),(select value from footer_proof),'authenticated result matches anonymous exactly');
select throws_ok($$ select private.resolve_homepage_slots() $$,'42501',null,'authenticated caller cannot bypass checked projection');
reset role;
update public.articles set status='archived',archived_at=now() where slug='footer-story-12';
set local role anon;
select is(public.get_public_read_this()#>>'{readThis,0,slug}','footer-story-9','archived curated story is replaced by next unreserved fallback');
select is(public.get_public_read_this()->'readThis',public.get_public_homepage()->'readThis','archived fallback stays identical to full homepage');
select ok(public.get_public_read_this()::text !~ 'footer-story-12','archived content is excluded');
reset role;
update public.articles set status='published',archived_at=null where slug='footer-story-12';
update public.sections set active=false where id='29000000-0000-0000-0000-000000000049';
set local role anon;
select is(public.get_public_read_this(),'{"kind":"ok","readThis":[]}'::jsonb,'inactive sections cannot leak footer cards');
reset role;
update public.sections set active=true where id='29000000-0000-0000-0000-000000000049';
update public.profiles set active=false where id='10000000-0000-0000-0000-000000000002';
set local role anon;
select is(public.get_public_read_this(),'{"kind":"ok","readThis":[]}'::jsonb,'inactive owners cannot leak footer cards');
reset role;
update public.profiles set active=true where id='10000000-0000-0000-0000-000000000002';
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key)
values('69000000-0000-0000-0000-000000000049','59000000-0000-0000-0000-000000000012',
 '00000000-0000-0000-0000-000000000002','89000000-0000-0000-0000-000000000049','footer/pending-049.webp');
insert into public.article_main_images(article_id,asset_id,alt_text,credit)
values('59000000-0000-0000-0000-000000000012','69000000-0000-0000-0000-000000000049','Pending image','Proof');
set local role anon;
select is(public.get_public_read_this()#>>'{readThis,0,slug}','footer-story-9','unfinalized image cards use eligible fallback');
reset role;
delete from public.article_main_images where article_id='59000000-0000-0000-0000-000000000012';
-- Legacy overlong profile identities are rejected by the existing checked map.
insert into public.profiles(id,display_name,slug) values('19000000-0000-0000-0000-000000000049','Unsafe footer owner',repeat('x',181));
update public.articles set owner_profile_id='19000000-0000-0000-0000-000000000049' where slug='footer-story-12';
set local role anon;
select is(public.get_public_read_this(),'{"kind":"unavailable"}'::jsonb,'unsafe mapped cards fail closed');
reset role;
update public.articles set owner_profile_id='10000000-0000-0000-0000-000000000002' where slug='footer-story-12';
-- Section composition overflow cannot make the bounded footer unavailable.
insert into public.sections(name,slug) select 'Footer overflow '||n,'footer-overflow-'||n from generate_series(1,101) n;
set local role anon;
select is(public.get_public_homepage()->>'kind','unavailable','full homepage retains its section overflow guard');
select is(public.get_public_read_this(),(select value from footer_proof),'narrow footer ignores unrelated homepage composition overflow');
reset role;
update public.articles set status='archived',archived_at=now() where section_id='29000000-0000-0000-0000-000000000049' and status='published' and slug<>'footer-story-12';
set local role anon;
select is(jsonb_array_length(public.get_public_read_this()->'readThis'),1,'sparse catalog keeps one curated card without fabricated fallbacks');
select is(public.get_public_read_this()#>>'{readThis,0,slug}','footer-story-12','sole reserved read-this card remains visible');
reset role;
select * from finish();
rollback;
