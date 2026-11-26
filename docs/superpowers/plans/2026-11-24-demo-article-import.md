# Plan: import the demo site's articles

Status: approved 2026-11-24; built and run against the local database (37 published articles, 0 drafts in the export). The hosted run was done on 2026-11-26 after a database backup: 37 published articles, 36 with photos; see the [runbook](../../runbooks/demo-article-import.md). Owner decisions are recorded below.

## Goal

Copy every article from the demo site (`~/Desktop/work/testing/demo-gavel-frontend`, a static site on its own Supabase project) into The Gavel's database so readers can see them on the Gavel site. It is a one-time migration that can be re-run safely, not a live sync.

## What the demo holds

- One `articles` table: `author_name` (free text), `slug`, `section` (news, features, opinions, sports, culture), `title` (≤200), `excerpt` (≤400, empty string when unset), `body` (≤100,000 plain text), `image_url` (public Storage URL), `image_alt`, `image_caption`, `image_credit`, `correction`, `featured`, `status` (draft or published), `published_at`, `content_updated_at`, `created_at`.
- Taxonomy: `categories` (16, each in one demo section), `tags`, and the join tables `article_categories` and `article_tags` (up to 10 tags).
- Body format: paragraphs split by blank lines, lines starting `## ` are headings, inline `[text](url)` links. Nothing else.
- Images: the public `article-images` bucket.
- The real content is on the hosted demo project. The local demo stack (port 55322) is empty, so the article count is unknown until the export step runs.

## Owner decisions (2026-11-24)

- **Bylines:** always a one-off writer credit carrying the demo `author_name`. Never linked to a member's author page.
- **Owner:** one "Imported archive" profile owns every imported article. It is a profile with no sign-in and is never shown publicly as a byline.
- **Scope:** published articles and drafts.
- **Status:** published articles are imported as published, even without a photo, alt text or credit. Drafts are imported as drafts already in review, so editors see them in the review queue.
- **Where:** a dry run and a real run against the local database first. The hosted database is a separate run that you approve.

## Field mapping

| Demo                                | Gavel                                        | Rule                                                                                                               |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                                | import ledger only                           | Key for re-runs; never exposed.                                                                                    |
| `slug`                              | `articles.slug`                              | Kept when free. On a clash the importer appends `-2`, `-3` and so on, and lists it in the report.                  |
| `title`                             | `title`                                      | Trimmed. It fits the 240-character limit.                                                                          |
| `excerpt`                           | `excerpt`                                    | Empty string becomes null.                                                                                         |
| `body`                              | `content` (gavel-draft v1)                   | See the body conversion below. An empty draft body becomes null.                                                   |
| `section` + categories              | `section_id`, `article_categories`           | Through the reviewed mapping file.                                                                                 |
| tags                                | `tags`, `article_tags`                       | Matched by slug and created when missing (see the caps note below).                                                |
| `author_name`                       | `article_contributors` writer                | One-off credit. The same name reuses the same credit across articles.                                              |
| `status`, `published_at`            | `status`, `published_at`, `publication_date` | Published keeps its original time; `publication_date` is the Eastern date.                                         |
| draft                               | `status='draft'`, `review_requested_at`      | Set to the import time; `review_note` stays null.                                                                  |
| `image_*`                           | `media_assets`, `article_main_images`        | See the images section below.                                                                                      |
| `correction`, `content_updated_at`  | `correction`, `correction_updated_at`        | Needs PR #152 merged first. Without a `content_updated_at`, the import time is used.                               |
| `featured`                          | not imported                                 | Homepage picks are curated by hand in Gavel. The report lists featured articles so an administrator can pick them. |
| `meta_description`, `seo_keyphrase` | null                                         | The demo has neither.                                                                                              |

## Body conversion

The importer is a pure function with unit tests:

- Split the body on blank lines and trim each block.
- A block starting `## ` becomes a heading (level 2). Every other block becomes a paragraph.
- A single line break inside a block becomes a `hardBreak`.
- `[text](url)` becomes a link mark when `isValidDraftLink(url)` accepts it. Otherwise only the text is kept, and the report counts the dropped links.
- The result must pass `checkDraftStructure`, the same check the editor uses. An article that fails is skipped and reported, never forced in.
- No HTML is ever produced, so there is no markup or injection path.

## Images

The importer downloads each `image_url` from the demo's public bucket, but only from the demo project host, and with a size cap and a timeout. It then runs the same processing as editor uploads (`src/backend/media/image-intake`, re-encoded WebP), so the original file is never stored.

Each image is uploaded with the service role into Gavel's private `article-media` bucket, then a finalized `media_assets` row and an `article_main_images` row are written. The uploader is the import profile.

When fields are missing:

- **No alt text:** the importer uses a default (see "Decisions still needed").
- **No credit:** "The Gavel".
- **No image, or a failed download:** the article is imported without a main photo, as you decided. The report lists these so editors can add photos later.

If the database write for an article fails after its image was uploaded, the importer deletes that object before moving on.

## Taxonomy mapping (needs your approval)

The two sites' sections differ. Gavel has no "News" section, and its categories are the live site's. The importer reads a checked-in mapping file, `scripts/demo-import/taxonomy-map.json`. A demo section or category with no entry stops the dry run instead of guessing.

Proposed defaults:

| Demo                                                    | Gavel                            |
| ------------------------------------------------------- | -------------------------------- |
| news / allston-brighton                                 | allston-brighton / news          |
| news / campus                                           | features / on-campus             |
| news / boston, news / national, news (no category)      | features / outside-of-bc         |
| features / investigations, profiles, student-life       | features / on-campus             |
| opinions / letter-to-the-editor                         | letter-to-the-editor section     |
| opinions / columns, editorials, opinions (no category)  | opinions / campus-pov            |
| sports / bc-athletics, pro-sports, sports (no category) | sports (no category)             |
| culture / arts, film-tv, music, gavel-groove            | culture / arts-and-entertainment |

## How it is built

### Slice 1: export (read-only, no Gavel changes)

`scripts/demo-import/export.mjs` reads the demo with its publishable key, the same access the demo site uses. RLS returns published articles to anyone, so the drafts need either:

- an export from the demo's Supabase Studio, or
- the demo's service key, supplied locally and never committed.

The script writes `demo-export.json` and the image files to a local folder outside the repository. The snapshot is what you review, and it makes later runs repeatable and offline.

### Slice 2: database support (one migration)

- `private.demo_import_ledger(source_id uuid primary key, article_id uuid unique, imported_at, source_hash)`, with row-level security on and no grants to application roles.
- `public.import_demo_article(p_payload jsonb)`: a security-definer function granted only to `service_role`, never to `anon` or `authenticated`. It is added to the catalog-invariant test allowlist as service-only. In one transaction it:
  - validates the content with `check_draft_input`;
  - inserts the article, links, credit and main image;
  - records a revision snapshot and the `article.created` and `article.published` (or `article.submitted`) audit events, with the import profile as actor;
  - writes the ledger row.

  It takes a transaction advisory lock on the source id. A source id already in the ledger with the same hash is a no-op; a different hash is a conflict the report shows. It never updates articles edited since the import.

- **One-off credits:** created inside the function. This bypasses the 50 open one-off credits per member cap, which exists against abuse by members and does not apply to a trusted import. Credits attached to articles are never removed by the orphan cleanup.
- **Tags:** created inside the function for the same reason (the daily tag cap is per member). Names follow the same validation as `ensure_tag`.
- **Slug:** the function allocates it with the existing slug allocator, so it cannot collide with a live article.

### Slice 3: importer

`scripts/demo-import/import.mjs --target local [--apply]`. Without `--apply` it is a dry run that converts everything and prints the report without writing:

- counts;
- skipped articles with the reason;
- slug changes;
- articles without a photo or with dropped links;
- unmapped taxonomy;
- featured stories.

With `--apply` it processes one article at a time: image first, then the database function. A failure on one article does not stop the others, and a re-run continues where it left off, because of the ledger.

It reads the target's URL and service-role key from environment variables only, and refuses a hosted target unless `--target hosted --confirm <project-ref>` matches.

### Slice 4: verification and docs

- Check public article pages, section and tag pages, search, sitemap, author archive (credit only, so no author page), and the review queue for the imported drafts.
- Update `docs/data-model.md`, `docs/api-contracts.md`, a runbook in `docs/runbooks/` for the hosted run, and an ADR for the import function (a privileged write path).

## Acceptance criteria

- The dry run against the snapshot reports every article as either importable or skipped with a reason, and writes nothing.
- After `--apply`:
  - every published demo article is readable at `/articles/<slug>` with its title, excerpt, body, byline, section, categories, tags, date and correction;
  - drafts appear in the review queue;
  - search and the sitemap include the published ones.
- Running `--apply` twice creates nothing new, and a crash halfway resumes cleanly.
- No application role can call the import function. Imported content passes the same validation as editor-written content.
- The hosted run happens only with your approval, after a database backup.

## Risks and how they are handled

- **Partial failure:** one transaction per article, plus the ledger, plus cleanup of the uploaded image on failure.
- **Duplicate runs or two importers at once:** the ledger's primary key and the advisory lock.
- **Unsafe content:** the body is converted to the structured format only, links are validated, and images are re-encoded.
- **Wrong taxonomy:** the mapping file is reviewed, and the dry run stops on gaps.
- **Rollback:**
  - Local: reset the database.
  - Hosted: take a backup before the run. A rollback script also deletes by ledger, as an administrator would through archive and delete. It needs your approval before running, because deletion is destructive.
- **Rollout order:** PR #152 (corrections) and the new migration ship first. The importer needs both.

## Decisions approved (2026-11-24)

1. The taxonomy mapping table above, as proposed.
2. Default alt text for images without one: the image caption if present, otherwise "Photo for <title>".
3. Featured stories are only listed in the report; no homepage picks are saved.
4. Still open: how to get drafts out of the hosted demo (a Studio export or the demo service key). The publishable key reads published articles only, so the export runs for published articles until this is settled.

## Verification commands

- pgTAP for the import function: denials for `anon`, `authenticated` and every role; idempotency; hash conflict; slug clash; validation failures.
- Vitest for body conversion, mapping and report.
- typecheck, lint, format check, build; then a dry run and an `--apply` run against the local database, with a browser check of a few imported articles.
