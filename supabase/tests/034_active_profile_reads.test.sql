begin;
select no_plan();
select ok(not has_function_privilege(r,'private.lock_media_actor(uuid)','execute'),r||' cannot invoke internal actor lock') from unnest(array['anon','authenticated','service_role']) r;
select set_config('storage.operation','object.get_authenticated',true);
update auth.users set email='proof-'||id::text||'@bc.edu',email_confirmed_at=now(),raw_app_meta_data='{"provider":"google"}'
where id in('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
update public.memberships set role='administrator' where user_id='00000000-0000-0000-0000-000000000003';
insert into public.sections(id,name,slug) values('20000000-0000-0000-0000-000000009934','Inactive Profile Proof','inactive-profile-proof');
insert into public.articles(id,owner_profile_id,section_id,title,slug) values('50000000-0000-0000-0000-000000009934','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000009934','Private proof','private-proof');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
values('60000000-0000-0000-0000-000000009934','50000000-0000-0000-0000-000000009934','00000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000009934','50000000-0000-0000-0000-000000009934/60000000-0000-0000-0000-000000009934.webp','finalized',12,2,2,repeat('a',64),now());
insert into public.article_main_images(article_id,asset_id,alt_text,credit) values('50000000-0000-0000-0000-000000009934','60000000-0000-0000-0000-000000009934','Proof image','Synthetic');
insert into storage.objects(bucket_id,name,metadata) values('article-media','50000000-0000-0000-0000-000000009934/60000000-0000-0000-0000-000000009934.webp','{"mimetype":"image/webp","size":12}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select count(*) from storage.objects where bucket_id='article-media' and name='50000000-0000-0000-0000-000000009934/60000000-0000-0000-0000-000000009934.webp'),1::bigint,'active admin can read the finalized object before deactivation');
-- Member-linked profiles cannot be deactivated through the profile RPC (that
-- locked members out with no way back); membership deactivation is the path.
select is(public.deactivate_contributor_profile('10000000-0000-0000-0000-000000000002',1,'80000000-0000-0000-0000-000000009934')->>'code','conflict','checked deactivation refuses an active member author');
select is(public.deactivate_contributor_profile('10000000-0000-0000-0000-000000000003',1,'80000000-0000-0000-0000-000000009935')->>'code','conflict','checked deactivation refuses another active admin');
select is((select count(*) from public.profiles where id in('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003') and active),2::bigint,'refused deactivation leaves both profiles active');
-- Read denial still holds for inactive profiles that already exist (legacy rows).
reset role;
update public.profiles set active=false where id in('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.articles where id='50000000-0000-0000-0000-000000009934'),1::bigint,'remaining active admin retains article read');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.articles where id='50000000-0000-0000-0000-000000009934'),0::bigint,'inactive owner profile cannot read article directly');
select is((select count(*) from public.media_assets where id='60000000-0000-0000-0000-000000009934'),0::bigint,'inactive owner cannot read media directly');
select is((select count(*) from public.article_main_images where article_id='50000000-0000-0000-0000-000000009934'),0::bigint,'inactive owner cannot read main image link');
select is((select count(*) from storage.objects where bucket_id='article-media' and name='50000000-0000-0000-0000-000000009934/60000000-0000-0000-0000-000000009934.webp'),0::bigint,'inactive owner cannot read Storage metadata');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select ok(not private.is_active_administrator(),'inactive admin profile loses database administrator authority');
select is((select count(*) from public.articles where id='50000000-0000-0000-0000-000000009934'),0::bigint,'inactive admin cannot read another owner article');
select is((select count(*) from public.media_assets where id='60000000-0000-0000-0000-000000009934'),0::bigint,'inactive admin cannot read another owner media');
select is((select count(*) from storage.objects where bucket_id='article-media' and name='50000000-0000-0000-0000-000000009934/60000000-0000-0000-0000-000000009934.webp'),0::bigint,'inactive admin cannot read Storage metadata');
select * from finish();
rollback;
