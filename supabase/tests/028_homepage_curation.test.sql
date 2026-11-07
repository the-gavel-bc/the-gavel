begin;
select no_plan();
select has_function('public','save_homepage_selections',
  array['integer','uuid','uuid','uuid[]','uuid[]'],
  'checked homepage selection save exists');
select has_function('public','get_admin_homepage_curation',array[]::text[],
  'checked homepage selection reader exists');
select has_table('public','homepage_curation','homepage version storage exists');
select has_table('public','homepage_selections','homepage selection storage exists');
select ok(not has_table_privilege('authenticated','public.homepage_curation','UPDATE'),
  'authenticated users cannot write homepage version directly');
select ok(not has_table_privilege('authenticated','public.homepage_selections','INSERT'),
  'authenticated users cannot insert homepage selections directly');
select ok(not has_table_privilege('anon','public.homepage_selections','SELECT'),
  'anonymous readers cannot access private curation storage');
select ok(not has_function_privilege('anon','public.save_homepage_selections(integer,uuid,uuid,uuid[],uuid[])','EXECUTE'),
  'anonymous cannot execute curation save');
update auth.users set email='homepage-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google"}'::jsonb
  where id in ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
delete from public.homepage_selections;
update public.homepage_curation set edit_version=1;
insert into public.sections(id,name,slug) values('83000000-0000-0000-0000-000000000001','Homepage test section','homepage-test-section');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
  select ('83000000-0000-0000-0000-'||pg_catalog.lpad(n::text,12,'0'))::uuid,
    '10000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000001',
    'Homepage story '||n,'homepage-test-'||n,'published','2090-01-01'::timestamptz+n*interval '1 minute'
  from pg_catalog.generate_series(1,10) n;
insert into public.articles(id,owner_profile_id,section_id,title,slug)
  values('83000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000002',
    '83000000-0000-0000-0000-000000000001','Private draft','homepage-test-draft');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000030',null,'{}','{}')->>'code'),
  'forbidden','inactive member cannot curate homepage');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000020',null,'{}','{}')->>'code'),
  'forbidden','author cannot curate homepage');
select throws_ok($$ select public.get_admin_homepage_curation() $$,'42501',null,
  'author cannot read administrator curation');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000021',
  '83000000-0000-0000-0000-000000000001',array['83000000-0000-0000-0000-000000000001'::uuid],'{}')->>'code'),
  'invalid_input','duplicate across groups rejected');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000022',null,
  array(select ('83000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5) n),'{}')->>'code'),
  'invalid_input','more than four featured articles rejected');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000023',
  '83000000-0000-0000-0000-000000000011','{}','{}')->>'code'),
  'invalid_input','draft article rejected');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000031',
  '83000000-0000-0000-0000-000000000099','{}','{}')->>'code'),
  'invalid_input','unknown article rejected');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000032',
  null,array[null::uuid],'{}')->>'code'),
  'invalid_input','null array entry rejected');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000033',
  null,'[0:0]={83000000-0000-0000-0000-000000000001}'::uuid[],'{}')->>'code'),
  'invalid_input','nonstandard array bounds rejected');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000024',
  '83000000-0000-0000-0000-000000000001',array['83000000-0000-0000-0000-000000000002'::uuid],
  array['83000000-0000-0000-0000-000000000003'::uuid])->>'version'),
  '2','administrator saves valid selections');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000024',
  '83000000-0000-0000-0000-000000000001',array['83000000-0000-0000-0000-000000000002'::uuid],
  array['83000000-0000-0000-0000-000000000003'::uuid])->>'replayed'),
  'true','exact save replays');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000024',null,'{}','{}')->>'code'),
  'request_conflict','changed request cannot reuse ID');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000025',null,'{}','{}')->>'code'),
  'conflict','stale version cannot overwrite');
select is((public.save_homepage_selections(2,'83000000-0000-0000-0000-000000000026',
  '83000000-0000-0000-0000-000000000001',array['83000000-0000-0000-0000-000000000002'::uuid],
  array['83000000-0000-0000-0000-000000000003'::uuid])->>'changed'),
  'false','unchanged selections are a no-op');
select is((public.get_admin_homepage_curation()#>>'{effective,lead,id}'),
  '83000000-0000-0000-0000-000000000001','curated lead is retained');
select is((public.get_admin_homepage_curation()#>>'{effective,featured,0,id}'),
  '83000000-0000-0000-0000-000000000002','curated featured order is retained');
select is((public.get_admin_homepage_curation()#>>'{effective,featured,1,id}'),
  '83000000-0000-0000-0000-000000000010','fallback takes newest unreserved article');
select is((public.get_admin_homepage_curation()#>>'{effective,readThis,0,id}'),
  '83000000-0000-0000-0000-000000000003','later curated story is reserved from fallback');
reset role;
update public.articles set status='archived',archived_at=now() where id='83000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((public.get_admin_homepage_curation()#>>'{saved,featured,0,status}'),'archived',
  'saved archived selection remains visible to administrator');
select is((public.get_admin_homepage_curation()#>>'{effective,featured,0,id}'),
  '83000000-0000-0000-0000-000000000010','archived selection is replaced by newest fallback');
select is((public.save_homepage_selections(2,'83000000-0000-0000-0000-000000000027',
  '83000000-0000-0000-0000-000000000002','{}','{}')->>'code'),
  'invalid_input','archived article cannot be selected');
reset role;
select is((select count(*)::integer from public.audit_events where resource_type='homepage'
  and correlation_id='83000000-0000-0000-0000-000000000024'),1,'changed save records one audit event');
create function pg_temp.fail_homepage_audit() returns trigger language plpgsql as $$
begin raise exception 'synthetic audit failure'; end;
$$;
create trigger test_homepage_audit_failure before insert on public.audit_events
  for each row when (new.action='homepage.updated') execute function pg_temp.fail_homepage_audit();
set local role authenticated;
select is((public.save_homepage_selections(2,'83000000-0000-0000-0000-000000000028',
  '83000000-0000-0000-0000-000000000004','{}','{}')->>'code'),
  'unavailable','audit failure returns safe error');
reset role;
select is((select edit_version from public.homepage_curation),2,'audit failure rolls back version');
select is((select article_id from public.homepage_selections where group_name='lead'),
  '83000000-0000-0000-0000-000000000001'::uuid,'audit failure preserves prior selection');
select is((select count(*)::integer from private.homepage_write_receipts where request_id=
  '83000000-0000-0000-0000-000000000028'),0,'audit failure leaves no receipt');
drop trigger test_homepage_audit_failure on public.audit_events;
set local role authenticated;
select is((public.save_homepage_selections(2,'83000000-0000-0000-0000-000000000029',
  '83000000-0000-0000-0000-000000000004','{}','{}')->>'version'),
  '3','later curation change increments version');
select is((public.save_homepage_selections(1,'83000000-0000-0000-0000-000000000024',
  '83000000-0000-0000-0000-000000000001',array['83000000-0000-0000-0000-000000000002'::uuid],
  array['83000000-0000-0000-0000-000000000003'::uuid])->>'replayed'),
  'true','original receipt replays after later save and archive');
reset role;
select is((select edit_version from public.homepage_curation),3,'replay does not undo a later change');
select * from finish();
rollback;
