begin;
select no_plan();
update private.media_cleanup_runtime set last_healthy_at=clock_timestamp() where id=true;
select has_table('private','media_key_registry','permanent key registry exists');
select has_table('private','media_cleanup_ledger','permanent cleanup ledger exists');
update auth.users set email='ledger-'||right(id::text,1)||'@bc.edu',email_confirmed_at=now(),raw_app_meta_data='{"provider":"google"}'::jsonb
 where id in ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004');
insert into public.sections(id,name,slug) values('85000000-0000-0000-0000-000000000001','Ledger test','ledger-test');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at)
 values('85000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000001','Ledger story','ledger-story','archived',now(),now());
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
 values('85000000-0000-0000-0000-000000000003','85000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000004','85000000-0000-0000-0000-000000000002/85000000-0000-0000-0000-000000000003.webp','uploading');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at) values
 ('85000000-0000-0000-0000-000000000010','85000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000011','ledger-finalized','finalized',1,1,1,repeat('a',64),now());
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status) values
 ('85000000-0000-0000-0000-000000000012','85000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000013','ledger-pending','pending'),
 ('85000000-0000-0000-0000-000000000014','85000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000015','ledger-deleting','deleting');
insert into public.article_main_images(article_id,asset_id,alt_text,credit) values('85000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000010','Test','Test');
insert into public.article_body_images(article_id,asset_id) values('85000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000010');
insert into public.article_revisions(article_id,actor_user_id,snapshot) values('85000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','{"mainImage":{"assetId":"85000000-0000-0000-0000-000000000010"}}');
insert into private.media_write_receipts(actor_user_id,request_id,article_id,payload_hash,result_version,result_updated_at,changed)
 values('00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000005','85000000-0000-0000-0000-000000000002',decode(repeat('a0',32),'hex'),1,now(),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.delete_archived_article('85000000-0000-0000-0000-000000000002',1,'85000000-0000-0000-0000-000000000006',true)->>'ok','true','administrator deletes article with an uploading asset');
reset role;
select is((select count(*)::int from public.articles where id='85000000-0000-0000-0000-000000000002'),0,'article removed');
select is((select count(*)::int from public.media_assets where id='85000000-0000-0000-0000-000000000003'),0,'asset metadata removed');
select is((select count(*)::int from private.media_cleanup_ledger where article_id='85000000-0000-0000-0000-000000000002'),4,'all four asset states remain on permanent cleanup ledger');
select is((select count(*)::int from private.media_write_receipts where article_id='85000000-0000-0000-0000-000000000002'),1,'media write receipt retained');
select is((select count(*)::int from private.retired_article_ids where article_id='85000000-0000-0000-0000-000000000002'),1,'article ID reserved for prefix cleanup');
select is((select retired from private.media_key_registry where asset_id='85000000-0000-0000-0000-000000000003'),true,'asset key permanently retired');
select throws_ok($$insert into public.articles(id,owner_profile_id,section_id,title,slug) values('85000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000001','Reuse ID','reuse-id')$$,'23505',null,'deleted article ID cannot be reused');
insert into public.articles(id,owner_profile_id,section_id,title,slug) values('85000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000001','Other article','other-ledger-article');
select throws_ok($$insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key) values('85000000-0000-0000-0000-000000000021','85000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000022','ledger-finalized')$$,'23505',null,'retired key cannot be reused by another article');
insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key)
 values('85000000-0000-0000-0000-000000000023','85000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000024','ordinary-removal-key');
select throws_ok($$update public.media_assets set object_key='changed-key' where id='85000000-0000-0000-0000-000000000023'$$,'23514',null,'live media object keys are immutable');
delete from public.media_assets where id='85000000-0000-0000-0000-000000000023';
select is((select count(*)::int from private.media_cleanup_ledger where object_key='ordinary-removal-key'),1,'ordinary media removal also creates a permanent cleanup record');
select throws_ok($$insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key) values('85000000-0000-0000-0000-000000000025','85000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000026','ordinary-removal-key')$$,'23505',null,'ordinary removed key cannot be reused');
select * from finish();
rollback;
