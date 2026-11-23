begin;
select no_plan();
select has_function('public','get_site_information',array[]::text[],'admin reader exists');
select has_function('public','save_site_information',array['integer','uuid','text','text','text','text','text','text','text'],'admin save exists');
select hasnt_function('public','save_site_information',array['integer','uuid','text','text','text','text'],'old six-argument save is removed');
select ok(not has_table_privilege('authenticated','public.site_information','UPDATE'),'direct writes closed');
select ok(not has_table_privilege('anon','public.site_information','SELECT'),'anonymous reads closed');
select ok(not has_function_privilege('anon','public.save_site_information(integer,uuid,text,text,text,text,text,text,text)','EXECUTE'),'anonymous save denied');
update auth.users set email='site-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(),
 raw_app_meta_data='{"provider":"google"}'::jsonb where id in (
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
update public.memberships set role='editor', active=true where user_id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select is((select count(*)::integer from public.get_site_information()),0,'inactive member cannot read');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000000','Denied',null,null,null,null,null,null)->>'code','forbidden','inactive member cannot save');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.get_site_information()),0,'author cannot read settings');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000001','Mission',null,null,null,null,null,null)->>'code','forbidden','author cannot save');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from public.get_site_information()),0,'editor cannot read administrator settings');
select is(public.save_site_information(1,gen_random_uuid(),'Denied',null,null,null,null,null,null)->>'code',
  'forbidden','editor cannot save administrator settings');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from public.get_site_information()),1,'administrator can read');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000002','<script>',null,null,null,null,null,null)->>'code','invalid_input','markup rejected');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000003','Mission','bad@',null,null,null,null,null)->>'code','invalid_input','invalid email rejected');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000004','Mission',null,'https://instagram.com.evil.test/a',null,null,null,null)->>'code','invalid_input','unsafe social URL rejected');
select is(public.save_site_information(1,'83000000-0000-0000-0000-0000000000e1','Mission','first..last@bc.edu',null,null,null,null,null)->>'code','invalid_input','email the public reader would hide is rejected at save');
select is(public.save_site_information(1,'83000000-0000-0000-0000-0000000000e2','Mission','desk@-bc.edu',null,null,null,null,null)->>'code','invalid_input','hyphen-edged domain label rejected at save');
select is(public.save_site_information(1,('83000000-0000-0000-0000-0000000000f'||n::text)::uuid,'Mission',null,null,null,
  case when kind='spotify' then url end,case when kind='linkedin' then url end,case when kind='facebook' then url end)->>'code',
  'invalid_input',kind||' link rejected: '||url)
from (values (1,'spotify','http://open.spotify.com/show/abc'),(2,'spotify','https://spotify.com.evil.test/show'),
  (3,'linkedin','https://www.linkedin.com/feed/'),(4,'linkedin','javascript:alert(1)'),
  (5,'facebook','https://facebook.com.evil.test/gavel'),(6,'facebook','https://www.facebook.com/gavel?x=<b>'),
  (7,'spotify','https://open.spotify.com/'||repeat('a',240))) t(n,kind,url);
savepoint valid_links;
select is(public.save_site_information(1,'83000000-0000-0000-0000-0000000000a0','Mission',null,null,null,
  'https://open.spotify.com/show/2abc','https://www.linkedin.com/company/the-gavel/','https://www.facebook.com/bcgavel')->>'version',
  '2','official Spotify, LinkedIn and Facebook links save');
select is((select row(spotify_url,linkedin_url,facebook_url)::text from public.get_site_information()),
  '(https://open.spotify.com/show/2abc,https://www.linkedin.com/company/the-gavel/,https://www.facebook.com/bcgavel)',
  'saved links are returned to administrators');
rollback to valid_links;
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000005',repeat('x',5001),null,null,null,null,null,null)->>'code','invalid_input','oversized text rejected');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000006',E'Mission\n\nparagraph','editor@bc.edu','https://www.instagram.com/thegavel/','Send a letter',null,null,null)->>'version','2','valid edit increments version');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000006',E'Mission\n\nparagraph','editor@bc.edu','https://www.instagram.com/thegavel/','Send a letter',null,null,null)->>'replayed','true','exact retry returns receipt');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000006','Different',null,null,null,null,null,null)->>'code','request_conflict','request payload cannot change');
select is(public.save_site_information(1,'83000000-0000-0000-0000-000000000007','Stale',null,null,null,null,null,null)->>'code','conflict','stale edit rejected');
select is(public.save_site_information(2,'83000000-0000-0000-0000-000000000008',E'Mission\n\nparagraph','editor@bc.edu','https://www.instagram.com/thegavel/','Send a letter',null,null,null)->>'changed','false','unchanged save is a no-op');
reset role;
alter table public.audit_events add constraint task14_force_audit_failure check (action <> 'site_information.updated') not valid;
set local role authenticated;
select is(public.save_site_information(2,'83000000-0000-0000-0000-000000000010','Should roll back',null,null,null,null,null,null)->>'code','unavailable','audit failure returns safe error');
select is((select mission from public.get_site_information()),E'Mission\n\nparagraph','audit failure rolls back settings');
reset role;
alter table public.audit_events drop constraint task14_force_audit_failure;
update auth.users set email_confirmed_at=null where id='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select is((select count(*)::integer from public.get_site_information()),0,'ineligible administrator cannot read');
select is(public.save_site_information(2,'83000000-0000-0000-0000-000000000009','Denied',null,null,null,null,null,null)->>'code','forbidden','ineligible administrator cannot save');
reset role;
select results_eq(
  $$select correlation_id from public.audit_events where action='site_information.updated'
    and correlation_id in ('83000000-0000-0000-0000-000000000006','83000000-0000-0000-0000-000000000008',
      '83000000-0000-0000-0000-000000000010')$$,
  $$values ('83000000-0000-0000-0000-000000000006'::uuid)$$,
  'only the committed change among these requests is audited');
select * from finish();
rollback;
