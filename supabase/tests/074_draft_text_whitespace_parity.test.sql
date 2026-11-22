begin;
select no_plan();
\ir support/draft-fixtures/draft-fixtures.inc

select is(private.check_draft_input_for_write(pg_temp.draft_input(jsonb_build_object(
  'title', U&'\00A0News')))->>'code',
  'invalid_input','draft title rejects leading non-breaking space');
select is(private.check_draft_input_for_write(pg_temp.draft_input(jsonb_build_object(
  'excerpt', U&'News\202F')))->>'code',
  'invalid_input','draft excerpt rejects trailing narrow non-breaking space');
select is(private.check_draft_input_for_write(pg_temp.draft_input(jsonb_build_object(
  'title', U&'Campus\00A0news')))->>'ok',
  'true','interior non-breaking space remains valid in draft metadata');

select is(private.check_draft_input_for_write(pg_temp.draft_input(jsonb_build_object(
  'title', U&'News\202Eroom')))->>'code',
  'invalid_input','draft title rejects an interior bidi override');
select is(private.check_draft_input_for_write(pg_temp.draft_input(jsonb_build_object(
  'excerpt', U&'News\001Croom')))->>'code',
  'invalid_input','draft excerpt rejects an interior control character');

create function pg_temp.image_doc(alt text, caption text) returns jsonb
language sql as $$
  select jsonb_build_object('format','gavel-draft','version',2,'document',
    jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object(
      'type','image','attrs',jsonb_build_object(
        'assetId','5d000000-0000-0000-0000-000000000074','alt',alt,'caption',caption)))));
$$;
create function pg_temp.is_valid_image_write(p_content jsonb) returns boolean
language sql as $$
  select (private.check_draft_input_for_write(pg_temp.draft_input(
    jsonb_build_object('content',p_content)))->>'ok')::boolean;
$$;

select ok(not pg_temp.is_valid_image_write(pg_temp.image_doc(U&'\00A0News photo',null)),
  'image alt rejects leading non-breaking space');
select ok(not pg_temp.is_valid_image_write(pg_temp.image_doc('News photo',U&'Campus\202F')),
  'image caption rejects trailing narrow non-breaking space');
select ok(pg_temp.is_valid_image_write(pg_temp.image_doc(U&'Campus\00A0photo','News')),
  'interior non-breaking space remains valid in a body image');

select ok(not pg_temp.is_valid_image_write(pg_temp.image_doc(U&'News\202Ephoto',null)),
  'image alt rejects an interior bidi override');
select ok(not pg_temp.is_valid_image_write(pg_temp.image_doc('News photo',U&'Campus\001Cnews')),
  'image caption rejects an interior control character');

select ok(private.is_valid_draft_document(
  pg_temp.image_doc(U&'News\202Ephoto',U&'Campus\001Cnews')),
  'document reads still accept stored alt text and captions');

-- Reconstruct the receipt and stored title a pre-upgrade call would have written.
set local role authenticated;
select is(public.create_article_draft('74000000-0000-0000-0000-000000000001',
  pg_temp.draft_input())->>'ok','true','create the receipt fixture');
reset role;
update public.articles set title=U&'News\202Eroom' where id=(
  select article_id from private.draft_write_receipts
  where request_id='74000000-0000-0000-0000-000000000001');
update private.draft_write_receipts set payload_hash=private.draft_request_hash(
  'create',null,null,private.check_draft_input(pg_temp.draft_input(
    jsonb_build_object('title',U&'News\202Eroom')))->'value')
  where request_id='74000000-0000-0000-0000-000000000001';

set local role authenticated;
select is(public.create_article_draft('74000000-0000-0000-0000-000000000001',
  pg_temp.draft_input(jsonb_build_object('title',U&'News\202Eroom')))->>'replayed',
  'true','an exact pre-upgrade retry returns the committed receipt');
select is(public.create_article_draft('74000000-0000-0000-0000-000000000001',
  pg_temp.draft_input(jsonb_build_object('title',U&'Other\202Eroom')))->>'code',
  'request_conflict','a changed payload cannot use the existing receipt');
select is(public.create_article_draft('74000000-0000-0000-0000-000000000002',
  pg_temp.draft_input(jsonb_build_object('title',U&'News\202Eroom')))->>'code',
  'invalid_input','a fresh request applies the stricter rules');
reset role;
select is((select count(*)::int from private.draft_write_receipts where request_id in
  ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002')),
  1,'retries and invalid writes leave a single receipt');

select * from finish();
rollback;
