-- Hosted Supabase Storage looks up an object's info (all columns, under an
-- info operation) before serving an authenticated-route download, so the
-- published-media policy, which allowed only the download operation, denied
-- every anonymous reader with "Object not found" (observed 2026-11-26:
-- 230 lookups, 0 rows). Local Storage serves the same request with the
-- download operation alone, which is why local tests passed.
--
-- Allow the read-only info operations as well. Visibility is unchanged:
-- only finalized, no-store objects referenced by a published article pass
-- private.can_read_published_media. Listing, uploads, updates and deletes
-- remain denied (no other operation or command is granted).
drop policy article_media_published_read on storage.objects;
create policy article_media_published_read on storage.objects
for select to anon,authenticated using (
  bucket_id='article-media'
  and storage.allow_any_operation(array[
    'object.get_authenticated',
    'object.get_authenticated_info',
    'object.head_authenticated_info',
    'storage.object.info_authenticated'
  ])
  and metadata->>'cacheControl'='no-store'
  and private.can_read_published_media(name)
);
