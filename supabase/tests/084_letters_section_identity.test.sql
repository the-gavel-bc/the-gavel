begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
create temp table stable_letters as
select id,name,slug,active,navigation_order,edit_version from public.sections where slug='letter-to-the-editor';
grant select on stable_letters to authenticated;
select is((select count(*) from stable_letters),1::bigint,'one stable Letters section exists');

insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
select auth.uid(),'84000000-0000-0000-0000-000000000001','section',id,
  private.membership_payload_hash(jsonb_build_object('kind','section','id',id,'expectedVersion',edit_version,
    'name','Earlier Letters Name','order',navigation_order,'active',active)),
  jsonb_build_object('ok',true,'kind','section','id',id,'version',edit_version+1,
    'active',active,'changed',true,'replayed',false)
from stable_letters;

set local role authenticated;
select is((select public.update_section_taxonomy(id,edit_version,'84000000-0000-0000-0000-000000000001',
  'Earlier Letters Name',navigation_order,active)->>'replayed' from stable_letters),'true',
  'a pre-upgrade name-change receipt still replays');
select is((select public.update_section_taxonomy(id,edit_version,gen_random_uuid(),
  'New Letters Name',navigation_order,active)->>'code' from stable_letters),'conflict','fresh renames are denied');
select is((select public.update_section_taxonomy(id,edit_version,gen_random_uuid(),
  name,navigation_order+100,active)->>'ok' from stable_letters),'true','navigation order is still editable');
select is((select public.delete_taxonomy('section',id,gen_random_uuid())->>'code' from stable_letters),
  'conflict','the stable section cannot be deleted');
reset role;

select throws_ok($$update public.sections set slug='silently-rename-letters' where slug='letter-to-the-editor'$$,
  '23514','The Letters section identity is fixed.','the database rejects changes to the stable slug');
select * from finish();
rollback;
