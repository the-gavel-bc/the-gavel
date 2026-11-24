# Site information: About page image, drop submission instructions

Decisions (user, 2026-11-24): the image is a banner under the About title; the How to Submit page and URL stay, but its text is no longer editable by the administrator.

Acceptance criteria

- An administrator can add, replace and remove one About image with required alt text on Site information; authors and editors are refused at the action and in the database.
- Uploads are re-encoded to WebP at most 1600 px wide; nothing original is stored; each change is audited.
- The About page shows the image when set and nothing when not; alt text appears only if the image fails to load.
- The Site information form no longer has submission instructions; saving keeps the stored text, and the public letters page keeps rendering it.

Design notes

- Same pattern as profile photos (private table, security-definer functions, public meta plus byte route). Not part of the versioned settings save, so an image change never conflicts with a text edit.
- `save_site_information` is unchanged (it was rewritten by three later migrations); the action passes the stored instructions back. A concurrent change bumps the version, so a stale pass-through becomes a conflict.
- The existing database column is kept, so no content is lost and the change is not destructive.

Verification: pgTAP `088_site_about_image.test.sql` and `029`; Vitest for processing, actions, form, page and command; typecheck, lint, format, build.

Not done: showing a different image per breakpoint; editing letters-page copy elsewhere; removing the stored instructions column.
