begin;
select no_plan();
select has_function('public','get_public_site_navigation',array[]::text[],'public site navigation projection exists');
select ok(has_function_privilege('anon','public.get_public_site_navigation()','execute'),'anonymous can execute projection');
select ok(has_function_privilege('authenticated','public.get_public_site_navigation()','execute'),'authenticated can execute projection');
select ok(not has_table_privilege('anon','public.site_information','select'),'anonymous cannot read settings table');
select ok(not has_table_privilege('authenticated','public.site_information','select'),'authenticated cannot directly read settings');
update public.sections set active=false where active;
update public.site_information set mission=null,contact_email=null,instagram_url=null,submission_instructions=null;
set local role anon;
select is(jsonb_array_length(public.get_public_site_navigation()->'sections'),0,'empty navigation returns an empty array');
select is(public.get_public_site_navigation()#>'{information,mission}','null'::jsonb,'unset mission remains null');
select throws_ok($$select * from public.site_information$$,'42501',null,'anonymous direct settings read denied');
select throws_ok($$select * from public.get_site_information()$$,'42501',null,'anonymous admin settings RPC denied');
reset role;
delete from public.site_information;
set local role anon;
select is(public.get_public_site_navigation()#>'{information,mission}','null'::jsonb,'missing singleton returns unset information');
reset role;
insert into public.site_information default values;
insert into public.sections(id,name,slug,navigation_order,active) values
 ('24000000-0000-0000-0000-000000000001','Navigation First','nav-first',1,true),
 ('24000000-0000-0000-0000-000000000002','Navigation Second','nav-second',2,true),
 ('24000000-0000-0000-0000-000000000003','Navigation Hidden','nav-hidden',0,false);
insert into public.categories(id,section_id,name,slug,navigation_order,active) values
 ('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Category Second','category-second',2,true),
 ('34000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000001','Category First','category-first',1,true),
 ('34000000-0000-0000-0000-000000000003','24000000-0000-0000-0000-000000000001','Category Hidden','category-hidden',0,false),
 ('34000000-0000-0000-0000-000000000004','24000000-0000-0000-0000-000000000003','Inactive Parent Child','hidden-parent-child',0,true);
update public.site_information set mission=E'Our mission\n\nSecond paragraph',contact_email='editor@bc.edu',
 instagram_url='https://www.instagram.com/thegavel/',submission_instructions='Send a letter',
 spotify_url='https://open.spotify.com/show/2abc',linkedin_url='https://www.linkedin.com/company/the-gavel/',
 facebook_url='https://facebook.com.evil.test/bcgavel';
create temporary table public_site_proof(value jsonb);
grant select,insert on public_site_proof to anon,authenticated;
set local role anon;
insert into public_site_proof select public.get_public_site_navigation();
select is((select value->>'kind' from public_site_proof),'ok','public projection succeeds');
select is((select jsonb_array_length(value->'sections') from public_site_proof),2,'only active sections shown');
select is((select value#>>'{sections,0,slug}' from public_site_proof),'nav-first','section navigation order respected');
select is((select value#>>'{sections,0,categories,0,slug}' from public_site_proof),'category-first','category navigation order respected');
select is((select jsonb_array_length(value#>'{sections,0,categories}') from public_site_proof),2,'inactive categories hidden');
select ok((select value::text from public_site_proof) !~ 'hidden-parent-child|nav-hidden|edit_version|receipts','hidden taxonomy and private settings excluded');
select is((select value#>>'{information,contactEmail}' from public_site_proof),'editor@bc.edu','valid email returned');
select is((select value#>>'{information,instagramUrl}' from public_site_proof),'https://www.instagram.com/thegavel/','valid Instagram link returned');
select is((select value#>>'{information,spotifyUrl}' from public_site_proof),'https://open.spotify.com/show/2abc','valid Spotify link returned');
select is((select value#>>'{information,linkedinUrl}' from public_site_proof),'https://www.linkedin.com/company/the-gavel/','valid LinkedIn link returned');
select is((select value#>'{information,facebookUrl}' from public_site_proof),'null'::jsonb,'unsafe stored Facebook link is hidden');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.get_public_site_navigation(),(select value from public_site_proof),'authenticated and anonymous output match');
select throws_ok($$select * from public.site_information$$,'42501',null,'authenticated direct settings read denied');
reset role;
update public.site_information set mission='<script>unsafe</script>',contact_email='bad@',
 instagram_url='https://instagram.com.evil.test/x',submission_instructions=E'bad\x01text';
set local role anon;
select is(public.get_public_site_navigation()#>'{information,mission}','null'::jsonb,'unsafe mission hidden');
select is(public.get_public_site_navigation()#>'{information,contactEmail}','null'::jsonb,'invalid email hidden');
select is(public.get_public_site_navigation()#>'{information,instagramUrl}','null'::jsonb,'unsafe Instagram URL hidden');
select is(public.get_public_site_navigation()#>'{information,submissionInstructions}','null'::jsonb,'unsafe control text hidden');
reset role;
update public.site_information set instagram_url=E'https://instagram.com/thegavel/\n',contact_email=E'editor@bc.edu\n';
set local role anon;
select is(public.get_public_site_navigation()#>'{information,instagramUrl}','null'::jsonb,'Instagram link with trailing newline hidden');
select is(public.get_public_site_navigation()#>'{information,contactEmail}','null'::jsonb,'email with trailing newline hidden');
reset role;
update public.site_information set contact_email='a..b@example.com';
set local role anon;
select is(public.get_public_site_navigation()#>'{information,contactEmail}','null'::jsonb,'email with repeated local dots hidden');
reset role;
update public.site_information set contact_email='a@domain-.com';
set local role anon;
select is(public.get_public_site_navigation()#>'{information,contactEmail}','null'::jsonb,'email with malformed domain hidden');
reset role;
insert into public.sections(id,name,slug,active)
select gen_random_uuid(),'Overflow section '||n,'overflow-section-'||n,true from generate_series(1,99) n;
set local role anon;
select is(public.get_public_site_navigation()->>'kind','unavailable','section overflow fails without truncation');
reset role;
update public.sections set active=false where slug like 'overflow-section-%';
insert into public.categories(id,section_id,name,slug,active)
select gen_random_uuid(),'24000000-0000-0000-0000-000000000001','Overflow category '||n,'overflow-category-'||n,true
from generate_series(1,999) n;
set local role anon;
select is(public.get_public_site_navigation()->>'kind','unavailable','category overflow fails without truncation');
reset role;
select * from finish();
rollback;
