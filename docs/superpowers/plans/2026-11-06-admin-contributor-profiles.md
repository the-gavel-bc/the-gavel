# Administrator Contributor Profiles Implementation Plan

**Goal:** Let administrators create guest contributors and edit/deactivate public profiles without changing login authority, article credits, or published URLs.

**Basis:** Accepted [Phase 4 editorial contract](../specs/2026-11-01-editorial-workflow-design.md), [Task 10](2026-10-29-phase-four-editorial-controls.md), and Task 9's checked mutation pattern. Task 9 PR #37 is the stack base. Existing profile pages do not offer editing; Task 12 will provide a separate owner operation.

## Decisions and risks

- Create means a guest profile with `auth_user_id = NULL`; approving a member remains Task 9. Admin edit may change only trimmed display name and plain-text biography. The database derives a collision-safe slug from display name until first ownership/credit on a published article, then keeps the stored slug fixed. Archived-only references do not freeze a never-published profile; an archived article necessarily has a publication history, so archived references also preserve the current slug.
- Deactivation blocks any current published or archived article ownership or credit. Draft references remain intact but unavailable for new selections. No hard delete or credit rewrite is exposed.
- Checked create/edit/deactivate RPCs derive actor from `auth.uid()`, require eligible active admin and profile, use expected profile version and request UUID, and atomically store one allowlisted audit event plus immutable exact-retry receipt. Inputs exclude `auth_user_id`, role, slug, actor, and arbitrary audit data. No-op edits store only a receipt. Conflict reload and exact uncertain retry retain the original request.
- Revoke direct authenticated profile UPDATE on display name/slug/biography when checked operations exist. This closes the generated-slug bypass for owners and administrators. Task 12 must add its own checked owner operation before enabling owner profile edits. Existing rows and associations are preserved. Rollback to direct writes would weaken the slug/audit contract and needs separate review.
- For race safety, a profile write locks its profile row; article publish/restore and contributor/owner link changes must serialize against that row before checking references. Verify existing publication operations' lock behavior before implementing; add a narrow guard if needed. Unknown references and malformed input fail safely.

## Slice A — storage and authority

- [x] pgTAP covers guest creation, collision/fallback, role denial, direct-write cutover, slug follow/freeze, owner/credit deactivation denial, credit preservation, audit, replay, no-op and stale conflict. Strict command tests reject identity-link and slug injection.
- [x] Profile version/receipt, closed audit actions, checked RPCs, bounded admin directory, and reference guards are installed; generated types match the upgraded local schema. A clean rebuild remains for CI. Existing names, slugs, links, and credits are preserved; backfilling the freeze flag updates timestamps for affected profiles.
- [x] Independent sessions prove rename versus published credit and deactivation versus publication serialize safely.

## Slice B — server and dashboard

- [x] Strict query/commands and user-scoped actions provide safe results, original-request retry, and conflict reload. Unit tests cover denial, malformed payloads, and safe projection.
- [x] `/dashboard/admin/contributors` provides bounded list/filter/pagination and create/edit/deactivate controls without a slug input or private Auth link. Browser tests cover guest creation, edit, deactivation, author denial and cursor recovery; SQL covers published freeze and deactivation denial.

## Slice C — handoff

- [x] Update lasting API/data/security/deployment contracts and `STATUS.md`; keep verification notes here.
- [ ] Finish final diff review and commits, then open Task 10 PR stacked on integration PR #38. Database, unit, concurrency, browser/build, types, lint and formatting passed locally; clean rebuild and hosted CI remain pending.

**Acceptance:** Only eligible active administrators can manage contributor profiles. Neither guest nor member profile changes grant login or article authority. Generated slugs follow display names only before publication. Published/archived references block deactivation. Every changed operation has one safe audit event; exact retries have no duplicate effect. Direct caller-selected slugs are closed.
