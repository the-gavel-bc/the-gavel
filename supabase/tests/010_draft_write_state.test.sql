begin;
select no_plan();
select has_column('public','articles','edit_version','article edit version exists');
select has_table('private','draft_write_receipts','private replay storage exists');
select has_table('private','draft_write_limits','private quota storage exists');
select columns_are('private','draft_write_receipts',array['actor_user_id','request_id','operation','article_id','expected_version','payload_hash','result_version','result_updated_at','changed','created_at'],'receipts have only bounded request/result metadata');
select columns_are('private','draft_write_limits',array['actor_user_id','window_start','attempt_count'],'quota has no draft data');
select ok(c.relrowsecurity,c.relname||' enables RLS') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('draft_write_receipts','draft_write_limits');
select ok(not has_table_privilege(role,relation,privilege),role||' cannot '||privilege||' '||relation)
from unnest(array['anon','authenticated']) role cross join unnest(array['private.draft_write_receipts','private.draft_write_limits']) relation cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege;
insert into private.draft_write_limits(actor_user_id) values ('00000000-0000-0000-0000-000000000002');
select is((select attempt_count from private.draft_write_limits where actor_user_id='00000000-0000-0000-0000-000000000002'),0,'quota defaults to zero');
select throws_ok($$update private.draft_write_limits set attempt_count=31$$,'23514',null,'quota cannot exceed thirty');
select throws_ok($$update private.draft_write_limits set attempt_count=-1$$,'23514',null,'quota cannot be negative');
insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,payload_hash,result_version,result_updated_at,changed) values
('00000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000051','create','50000000-0000-0000-0000-000000000051',sha256('synthetic'::bytea),1,now(),true);
select is((select count(*)::integer from private.draft_write_receipts),1,'receipt resource UUID needs no current article');
select throws_ok($$update private.draft_write_receipts set operation='delete'$$,'23514',null,'receipt operation is closed');
select throws_ok($$update private.draft_write_receipts set expected_version=1$$,'23514',null,'create expected version must be NULL');
select throws_ok($$update private.draft_write_receipts set payload_hash='x'::bytea$$,'23514',null,'receipt hash is SHA256 sized');
select throws_ok($$update private.draft_write_receipts set result_version=0$$,'23514',null,'receipt version must be positive');
delete from auth.users where id='00000000-0000-0000-0000-000000000002';
select ok(not exists(select 1 from private.draft_write_receipts)
  and not exists(select 1 from private.draft_write_limits),'private actor state cascades when its Auth identity is erased');
select * from finish();
rollback;
