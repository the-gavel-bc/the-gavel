begin;
select no_plan();
select ok(not has_function_privilege('service_role','private.cleanup_claim_horizon()','EXECUTE'),'claim horizon helper stays private');
insert into private.article_id_registry(article_id) values('87000000-0000-4000-8000-000000000001');
insert into private.retired_article_ids(article_id) values('87000000-0000-4000-8000-000000000001');
-- 250 keys exceed the old single-batch daily ceiling of about 210.
insert into private.media_key_registry(object_key,asset_id,article_id,retired)
 select 'capacity-key-'||lpad(n::text,3,'0'),gen_random_uuid(),'87000000-0000-4000-8000-000000000001',true from generate_series(1,250) n;
insert into private.media_cleanup_ledger(object_key,asset_id,article_id)
 select object_key,asset_id,article_id from private.media_key_registry where object_key like 'capacity-key-%';
update private.media_cleanup_ledger set created_at=now()-interval '30 days',last_attempt_at=now()-interval '8 days',last_succeeded=true
 where object_key like 'capacity-key-%';
update private.media_cleanup_ledger set last_attempt_at=now()-interval '1 day',last_succeeded=false where object_key='capacity-key-250';
create temp table capacity_claims(object_key text,claim_token uuid,round integer);
grant select,insert on capacity_claims to service_role;

set local role service_role;
select set_config('test.run_token',public.start_media_cleanup_run()::text,true);
insert into capacity_claims select c.*,1 from public.claim_media_cleanup(1) c;
reset role;
select is((select object_key from capacity_claims where round=1),'capacity-key-250','a failed row is claimed before older successful rows');

-- The sweeper finishes each batch before claiming the next one.
set local role service_role;
select count(*) from capacity_claims c where round=1 and public.finish_media_cleanup(c.object_key,c.claim_token,true);
insert into capacity_claims select c.*,2 from public.claim_media_cleanup(100) c;
select count(*) from capacity_claims c where round=2 and public.finish_media_cleanup(c.object_key,c.claim_token,true);
insert into capacity_claims select c.*,3 from public.claim_media_cleanup(100) c;
select count(*) from capacity_claims c where round=3 and public.finish_media_cleanup(c.object_key,c.claim_token,true);
insert into capacity_claims select c.*,4 from public.claim_media_cleanup(100) c;
select count(*) from capacity_claims c where round=4 and public.finish_media_cleanup(c.object_key,c.claim_token,true);
insert into capacity_claims select c.*,5 from public.claim_media_cleanup(100) c;
select count(*) from capacity_claims c where round=5 and public.finish_media_cleanup(c.object_key,c.claim_token,true);
reset role;
select is((select count(*)::int from capacity_claims where object_key like 'capacity-key-%'),250,'one run claims every ledger key');
select is((select count(distinct object_key)::int from capacity_claims where object_key like 'capacity-key-%'),250,'no key is claimed twice in one run');
select is((select count(*)::int from capacity_claims where round=5),0,'claims end once the run has covered the backlog');
set local role service_role;
select is((public.get_media_cleanup_backlog()->>'staleKeys')::int,0,'a backlog beyond one old batch stays healthy after a covering run');
-- Prefixes follow the same per-run rule.
select is((select count(*)::int from public.claim_retired_article_prefixes(100) where article_id='87000000-0000-4000-8000-000000000001'),1,'prefix claimed once in the run');
select is((select count(*)::int from public.claim_retired_article_prefixes(100) where article_id='87000000-0000-4000-8000-000000000001'),0,'prefix not reclaimed in the same run');
select is(public.finish_media_cleanup_run(current_setting('test.run_token')::uuid,true),true,'run completes');
-- Outside a run, claims keep their previous unrestricted behavior.
select ok((select count(*)::int from public.claim_media_cleanup(100) where object_key like 'capacity-key-%')>0,'claims outside a run are not limited by the horizon');
reset role;

select * from finish();
rollback;
