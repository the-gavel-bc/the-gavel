begin;
select no_plan();
update auth.users set email='about-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(),
 raw_app_meta_data='{"provider":"google"}'::jsonb where id in (
 '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
update public.memberships set role='editor', active=true where user_id='00000000-0000-0000-0000-000000000003';
select ok(not has_table_privilege('authenticated','private.site_about_image','SELECT')
  and not has_table_privilege('anon','private.site_about_image','SELECT'),'image bytes are not directly readable');
select ok(not has_function_privilege('anon','public.set_site_about_image(bytea,text)','EXECUTE'),'anonymous cannot set');
create temp table webp as select '\x52494646000000005745425000'::bytea b;
grant select on webp to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.set_site_about_image((select b from webp),'Alt')->>'code','forbidden','author cannot set');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select is(public.set_site_about_image((select b from webp),'Alt')->>'code','forbidden','editor cannot set');
select is(public.remove_site_about_image()->>'code','forbidden','editor cannot remove');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.set_site_about_image('\x00010203'::bytea,'Alt')->>'code','invalid_input','non-WebP bytes rejected');
select is(public.set_site_about_image((select b from webp),'')->>'code','invalid_input','empty alt rejected');
select is(public.set_site_about_image((select b from webp),'<b>x</b>')->>'code','invalid_input','markup alt rejected');
select is((select count(*)::int from public.get_public_site_about_image_meta()),0,'no image yet');
select is(public.set_site_about_image((select b from webp),'The newsroom')->>'ok','true','administrator sets the image');
select is(public.set_site_about_image((select b from webp),'Newsroom 2')->>'ok','true','replace keeps one row');
set local role anon;
select is((select alt from public.get_public_site_about_image_meta()),'Newsroom 2','anonymous reads alt');
select is((select count(*)::int from public.get_public_site_about_image()),1,'anonymous reads bytes');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.remove_site_about_image()->>'ok','true','administrator removes');
select is(public.remove_site_about_image()->>'ok','true','removing again is harmless');
select is((select count(*)::int from public.get_public_site_about_image_meta()),0,'image gone');
reset role;
select is((select count(*)::int from public.audit_events where action='site_information.image_changed'
  and actor_user_id='00000000-0000-0000-0000-000000000004'),3,'set, replace and one real removal are audited');
select * from finish();
rollback;
