# 0015: Import demo articles through a service-only database function

- Status: Accepted
- Date: 2026-11-24
- Related requirements: [plan](../superpowers/plans/2026-11-24-demo-article-import.md), [runbook](../runbooks/demo-article-import.md)
- Supersedes / superseded by: none

## Context

The demo site's articles (37 published at export time) must become readable Gavel articles. Normal saves run as a signed-in member, charge the draft rate limit, cap one-off credits and new tags per member, and require a main photo with alt text and credit to publish. A one-time import by the owner should not be bound by those member limits, but must not open a new write path for members.

## Decision

A single `public.import_demo_article(actor, payload, image, dry_run)` function, executable only by `service_role`, writes one article per call in one transaction: it validates the body and references with the same functions editor saves use, records a revision and audit events with a named administrator as actor, and records the demo id with a content hash in `private.demo_import_ledger`. A dry run performs every check and write and then rolls back. A Node script exports the demo to a reviewed snapshot and calls the function; images are re-encoded with the editor upload settings and uploaded before the article write, and removed again if the write fails. Owner decisions: every byline is a one-off credit, one "The Gavel Archive" profile owns the articles, published articles keep their date with or without a photo, drafts arrive in review.

## Alternatives considered

- Replaying the articles through the editor's server actions: would hit member rate limits and caps and cannot publish articles without a photo.
- Raw SQL inserts in a script: bypasses the shared validators and leaves no audit trail.
- Sign in as an administrator in a browser and recreate the articles: slow and error prone for 37 articles.

## Consequences

- Imported articles can be published without a main photo or real alt text (the alt text default is the caption or "Photo for <title>"); editors can add these later.
- The function stays in the schema after the import; it is harmless because only the service role can call it. It can be dropped once the hosted import is done.
- Re-running is safe; a demo article changed after its import is reported, not merged.

## Validation

pgTAP `090_demo_article_import.test.sql`; Vitest `scripts/demo-import/convert.test.mjs`; a local dry run and import of all 37 demo articles (re-run imports nothing), checked in a browser.
