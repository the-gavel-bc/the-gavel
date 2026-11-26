begin;
select no_plan();
-- Body images accept an optional credit and file name; older shapes stay valid.
create function pg_temp.doc(attrs jsonb) returns jsonb language sql as $$
  select jsonb_build_object('format','gavel-draft','version',2,'document',
    jsonb_build_object('type','doc','content',jsonb_build_array(
      jsonb_build_object('type','image','attrs',attrs))));
$$;
select ok(private.is_valid_draft_document_for_write(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":null}')),
  'an image without credit or name is still valid');
select ok(private.is_valid_draft_document_for_write(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":"On the quad","credit":"Jane Doe","name":"rally.jpg"}')),
  'credit and file name are accepted');
select ok(private.is_valid_draft_document_for_write(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":null,"credit":null,"name":null}')),
  'null credit and file name are accepted');
select ok(not private.is_valid_draft_document_for_write(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":null,"src":"x"}')),
  'unknown image keys are still rejected');
select ok(not private.is_valid_draft_document_for_write(pg_temp.doc(
  jsonb_build_object('assetId','60000000-0000-0000-0000-000000000701','alt','Rally','caption',null,'credit',repeat('a',241)))),
  'a credit over 240 characters is rejected');
select ok(not private.is_valid_draft_document_for_write(pg_temp.doc(
  jsonb_build_object('assetId','60000000-0000-0000-0000-000000000701','alt','Rally','caption',null,'name',repeat('a',201)))),
  'a file name over 200 characters is rejected');
select ok(not private.is_valid_draft_document_for_write(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":null,"credit":" Jane"}')),
  'a credit with edge whitespace is rejected');
select ok(not private.is_valid_draft_document_for_write(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":null,"credit":5}')),
  'a non-text credit is rejected');
select ok(private.is_valid_draft_document(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":null,"credit":"Jane Doe","name":"rally.jpg"}')),
  'stored articles with credit and file name stay valid for editorial steps');
select ok(not private.is_valid_draft_document(pg_temp.doc(
  '{"assetId":"60000000-0000-0000-0000-000000000701","alt":"Rally","caption":null,"src":"x"}')),
  'the stored-content check still rejects unknown image keys');
select * from finish();
rollback;
