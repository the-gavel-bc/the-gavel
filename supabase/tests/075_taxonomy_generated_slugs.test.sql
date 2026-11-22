begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc

-- Existing slugs retain their URLs even if they match a reserved route.
insert into public.tags(name,slug) values ('Older route tag','authors');
insert into public.tags(name,slug) values ('Collision fixture',
  'n-'||left(encode(sha256(convert_to(U&'\5927\962A','UTF8')),'hex'),8));
insert into public.sections(id,name,slug,navigation_order) values
  ('75000000-0000-0000-0000-000000000001','Older section','api',1);
insert into private.taxonomy_write_receipts(actor_user_id,request_id,kind,resource_id,payload_hash,result)
select '00000000-0000-0000-0000-000000000004','75000000-0000-0000-0000-000000000002','section',
  '75000000-0000-0000-0000-000000000001',
  private.membership_payload_hash(jsonb_build_object('operation','create','kind','section',
    'name','Older section','order',1,'parent',null)),
  '{"ok":true,"kind":"section","id":"75000000-0000-0000-0000-000000000001","slug":"api","replayed":false}'::jsonb;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;

select is(public.create_taxonomy('section',gen_random_uuid(),'Search',1,null)->>'slug',
  'search-2','a new section skips the reserved route slug');
select is(public.create_taxonomy('section',gen_random_uuid(),'Search!',1,null)->>'slug',
  'search-3','a new section still handles collisions after skipping a reserved slug');
select is(public.ensure_tag('Tags')->>'slug','tags-2','a new tag skips its reserved route slug');
select is(public.ensure_tag('Older route tag')->>'slug','authors','a previously saved tag keeps its slug');
select is(public.create_taxonomy('section','75000000-0000-0000-0000-000000000002',
  'Older section',1,null),
  '{"ok":true,"kind":"section","id":"75000000-0000-0000-0000-000000000001","slug":"api","replayed":true}'::jsonb,
  'an exact older receipt returns the original reserved slug');
select is(public.create_taxonomy('category',gen_random_uuid(),'Search',1,
  '20000000-0000-0000-0000-000000000051')->>'slug',
  'search','category slugs are scoped to their section');

select is(public.create_taxonomy('section',gen_random_uuid(),U&'\6771\4EAC',1,null)->>'slug',
  'n-'||left(encode(sha256(convert_to(U&'\6771\4EAC','UTF8')),'hex'),8),
  'a section name without a Latin slug uses its digest');
select is(public.create_taxonomy('category',gen_random_uuid(),U&'\6771\4EAC',1,
  '20000000-0000-0000-0000-000000000051')->>'slug',
  'n-'||left(encode(sha256(convert_to(U&'\6771\4EAC','UTF8')),'hex'),8),
  'scoped categories use the same digest rule');
select is(public.ensure_tag(U&'\6771\4EAC')->>'slug',
  'n-'||left(encode(sha256(convert_to(U&'\6771\4EAC','UTF8')),'hex'),8),
  'tag creation uses the normalized name digest');
select is(public.ensure_tag(U&'\4EAC\90FD')->>'slug',
  'n-'||left(encode(sha256(convert_to(U&'\4EAC\90FD','UTF8')),'hex'),8),
  'different non-Latin tag names get different slug bases');
select is(public.ensure_tag(U&'\5927\962A')->>'slug',
  'n-'||left(encode(sha256(convert_to(U&'\5927\962A','UTF8')),'hex'),8)||'-2',
  'a hash base collision gets the usual numerical suffix');

reset role;
select * from finish();
rollback;
