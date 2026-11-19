# Purge an image from article history

Use when an image that was once saved on an article (a wrong, private, or sensitive photo) must disappear even though revision history still references it. Ordinary removal cannot do this because retained revisions pin the image (ADR 0009).

1. Remove the image from the article first (replace or clear the main image, delete it from the body, save). `purge_article_image` refuses an image that is still attached.
2. As an administrator, call `purge_article_image(article_id, asset_id)` (a signed-in administrator through the Supabase API, or the SQL editor with that user's claim). A `{"ok":true}` result means the image is hidden from every reader immediately and its history references are gone.
3. The daily `/api/internal/unused-upload-cleanup` job deletes the Storage object and the row. To delete the object sooner, run the job manually or remove the object from the `article-media` bucket by its `object_key`.
4. Confirm an `article.image_purged` event appears in the article audit.

Limits: revision snapshots still contain the asset ID (without bytes). There is no screen for this yet.
