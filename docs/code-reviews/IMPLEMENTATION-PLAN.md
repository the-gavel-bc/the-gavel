# Implementation plan: media review

Status (2026-11-20): approved by the owner, who also delegated the open decisions (recorded in [plans/README.md](plans/README.md)). Implemented on branch `fix/media-review-hardening`. Per-item results are in [FINAL-IMPLEMENTATION-REPORT.md](FINAL-IMPLEMENTATION-REPORT.md). Items marked "discuss first" fall under AGENTS.md changes that need discussion (content lifecycle, destructive migrations, new behavior).

## Priorities

- P0 Critical: none.
- P1: F-01 expiry starvation, F-02 editor media tests, F-03 unfinished uploads.
- P2: F-04 upload slot starvation, F-05 profile photo, F-06 docs, F-07 cleanup ledger scale, F-08 race tests, F-09 cron/denial tests, F-10 authority hardening.
- P3: F-11 to F-15.
- Decision: ADR 0009 revision retention (no work until decided).

## Batches (recommended order)

**Batch A: expiry correctness (F-01, F-03)** one new migration redefining `claim_expired_unused_uploads` (article-status join, window ordering, optional `pending`/`uploading` claim) and, if chosen, `submit` rejecting while unfinished assets exist; plus the TypeScript loop in `unused-upload-expiry.ts`. Files overlap with F-07 and F-08, so do A first. Discuss first: the rule for unfinished uploads and the submit conflict (lifecycle behavior). Tests: pgTAP 066 additions, Vitest expiry test. Risk: Medium (changes a deletion job).

**Batch B: tests (F-02, F-08, F-09, F-12, F-13)** tests and scripts only, no behavior change; can run in parallel with C. pgTAP `068_editor_media_authority`, route and action test parametrization, cron-auth table test, concurrency scripts, `test:db:clean`. Risk: Low. Reveals real bugs if any; fix those under Batch A or a follow-up.

**Batch C: upload and profile photo hardening (F-04, F-05)** touches `route.ts`, `media-form.ts`, `processing-gate.ts`, `src/backend/profiles/profile-photo/*`, one migration for `get_public_profile_photo` and an admin remove RPC. Discuss first: administrator photo removal and the active-membership rule for public photos. Risk: Medium.

**Batch D: docs (F-06, F-14 docs part)** after A and C so the docs describe final behavior; plus ADR 0012 note on the published-article narrowing. Risk: Low.

**Batch E: authority hardening (F-10)** one migration plus pgTAP scan test. Do after B so denial tests exist first. Risk: Medium (redefines security functions).

**Batch F: cleanup scalability (F-07)** measure first (`EXPLAIN` on a seeded ledger); then index and sweep change. Defer until measured. Risk: Medium.

**Later (P3):** F-11 Origin check, F-15 handoff checks.

## Dependencies and overlaps

A before D, E, F. B before E. A and F both touch the cleanup and expiry area; do not run in parallel. C and B can run in parallel. Every migration needs the `private.article_authority` pattern preserved.

## Verification for any batch

`pnpm typecheck`, `pnpm lint`, `pnpm test`, the touched pgTAP files on a freshly reset database (not the long-lived one), `pnpm test:draft-concurrency` for B and A, and a diff review. Report only checks that actually ran.
