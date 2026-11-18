begin;
select no_plan();
update auth.users set email='photo-admin@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id='00000000-0000-0000-0000-000000000004';
update auth.users set email='photo-author@bc.edu',email_confirmed_at=now(),
  raw_app_meta_data='{"provider":"google","providers":["google"]}'::jsonb
  where id='00000000-0000-0000-0000-000000000002';
create temp table photo_bytes as select
  ('\x52494646'::bytea || '\x10000000'::bytea || '\x57454250'::bytea || '\x56503820'::bytea || '\x04000000'::bytea || '\x00112233'::bytea) as good,
  ('\x52494646'::bytea || '\x24000000'::bytea || '\x57454250'::bytea || '\x00112233'::bytea) as framing_only,
  '\x89504e470d0a1a0a'::bytea as png;
grant select on photo_bytes to authenticated, anon;

select ok(not has_function_privilege('anon','public.set_own_profile_photo(bytea)','EXECUTE'),
  'anonymous cannot set a photo');
select ok(has_function_privilege('anon','public.get_public_profile_photo(text)','EXECUTE'),
  'anyone can read a public photo');
select ok(not has_table_privilege('authenticated','private.profile_photos','SELECT'),
  'photo bytes are not directly readable');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.set_own_profile_photo((select png from photo_bytes))->>'code','invalid_input',
  'only WebP is accepted');
select is(public.set_own_profile_photo(null)->>'code','invalid_input','empty is rejected');
select is(public.set_own_profile_photo((select good from photo_bytes))->>'ok','true','a member sets their photo');
reset role;
select ok((select photo_updated_at is not null from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002'),
  'the profile records the photo time');
select is((select count(*)::int from private.profile_photos),1,'one photo is stored');
create temp table photo_slug as select slug from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002';
grant select on photo_slug to anon;
set local role anon;
select is((select count(*)::int from public.get_public_profile_photo((select slug from photo_slug))),1,
  'the public can read a member photo by slug');
select is((select count(*)::int from public.get_public_profile_photo('nobody-here')),0,'unknown slug has no photo');
reset role;
-- Account-less credit profiles never expose a photo.
insert into public.profiles(id,display_name,slug) values('a4000000-0000-0000-0000-000000000001','Credit Only','credit-only-photo');
insert into private.profile_photos(profile_id,bytes) values('a4000000-0000-0000-0000-000000000001',(select good from photo_bytes));
set local role anon;
select is((select count(*)::int from public.get_public_profile_photo('credit-only-photo')),0,'credit-only profiles have no public photo');
reset role;
-- Another person cannot change someone else's photo: each call only touches the caller's own.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.remove_own_profile_photo()->>'ok','true','removal affects only the caller');
reset role;
select is((select count(*)::int from private.profile_photos where profile_id=
  (select id from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002')),1,
  'another member''s photo is untouched');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.remove_own_profile_photo()->>'ok','true','a member removes their own photo');
reset role;
select ok((select photo_updated_at is null from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002'),
  'removal clears the profile photo time');

-- Strict container check, public visibility, takedown, and rate limit.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.set_own_profile_photo((select framing_only from photo_bytes))->>'code','invalid_input',
  'RIFF/WEBP framing without a real VP8 chunk and a matching length is rejected');
reset role;
create temp table photo_profile as select id from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002';
grant select on photo_profile to authenticated;
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.get_public_profile_photo((select slug from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002'))),0,
  'a deactivated member''s photo is not served');
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select public.set_own_profile_photo((select good from photo_bytes));
reset role;
select is((select count(*)::int from public.get_public_profile_photo((select slug from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002'))),1,
  'an active member''s photo is served');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is(public.admin_remove_profile_photo((select id from photo_profile))->>'code','not_found',
  'a non-administrator cannot take a photo down');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.admin_remove_profile_photo((select id from photo_profile))->>'ok','true',
  'an administrator can take any photo down');
reset role;
select is((select count(*)::int from private.profile_photos where profile_id=(select id from public.profiles where auth_user_id='00000000-0000-0000-0000-000000000002')),0,
  'the photo is gone');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
create temp table photo_runs as select n, public.set_own_profile_photo((select good from photo_bytes))->>'code' as code
  from generate_series(1,35) n;
reset role;
select ok((select count(*) from photo_runs where code='rate_limited')>=1,'photo writes are rate limited');
select * from finish();
rollback;
