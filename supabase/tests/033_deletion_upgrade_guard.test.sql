begin;
select no_plan();
create trigger guard_article_delete_during_upgrade before delete on public.articles for each row execute function private.guard_article_delete_during_upgrade();
update private.media_cleanup_runtime set last_healthy_at=now() where id=true;
update auth.users set email='upgrade-admin@bc.edu',email_confirmed_at=now(),raw_app_meta_data='{"provider":"google"}'::jsonb where id='00000000-0000-0000-0000-000000000004';
insert into public.sections(id,name,slug) values('87000000-0000-0000-0000-000000000001','Upgrade guard','upgrade-guard');
insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at,archived_at)
 values('87000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','87000000-0000-0000-0000-000000000001','Guard article','guard-article','archived',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select is(public.delete_archived_article('87000000-0000-0000-0000-000000000002',1,'87000000-0000-0000-0000-000000000003',true)->>'code','unavailable','upgrade guard blocks deletion RPC');
reset role;
select is((select count(*)::int from public.articles where id='87000000-0000-0000-0000-000000000002'),1,'guard rollback preserves article');
select is((select count(*)::int from private.retired_article_ids where article_id='87000000-0000-0000-0000-000000000002'),0,'guard rollback leaves no retirement records');
select * from finish();
rollback;
