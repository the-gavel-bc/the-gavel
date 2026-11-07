# Administrator Homepage Curation Implementation Plan

**Goal:** Let eligible administrators save ordered homepage selections and derive deterministic recent-content fallbacks without exposing private articles.

**Basis:** [Phase 4 contract](../specs/2026-11-01-editorial-workflow-design.md), [Task 13](2026-10-29-phase-four-editorial-controls.md), and product requirements. Branch from main after Task 12 PR #43 merged with a passing foundation check.

## Decisions and risks

- Owner decision: one lead, up to four Featured News, and up to four Read This articles, with no article repeated across any slots. Any published article may be featured. Missing or archived selections fall back to newest published articles, excluding stories already shown. Reserve every eligible curated selection before filling gaps so a fallback cannot displace an explicitly chosen later slot. Order fallback by `published_at DESC, id DESC`; fill lead, Featured News, then Read This, leaving any remaining slots empty if fewer eligible articles exist.
- A single versioned configuration is saved atomically through a narrow administrator RPC with expected version and request UUID. It rejects unknown/draft/archived IDs, invalid ordering and caller-supplied audit fields. Exact retries preserve their original result; mismatched requests conflict; no-op changes record only a receipt. An uncertain result retains its exact retry handle even after later denial. Stale edits offer explicit conflict recovery without silently discarding input.
- Lock selected article rows in stable ID order and recheck published status after waits. An archive may occur after a successful selection; reads must re-evaluate eligibility and derive fallback from current published content, without mutating stored selections or requiring an archive to fail. Test both selection/archive interleavings and ensure fallback never exposes private article content.
- Store only ordered IDs and bounded audit metadata; no article body or arbitrary display fields. Administrator UI uses independently guarded, bounded candidate queries and user-scoped clients. Public rendering and public data grants remain Phase 5 work.
- Existing databases receive additive storage, versioning, receipts and narrowly allowlisted audit actions without rewriting articles or history. Direct application writes remain closed. Do not reset the existing local preview database; clean rebuild runs in an isolated environment or CI.

## Slices and verification

- [x] Database tests cover role denial, bounds/order/duplicates, eligibility, fallback, stale/no-op/replay, audit and rollback. Forward migrations add permission-closed storage and checked RPCs; generated types match the upgraded local schema. The API session rejected an unqualified delete during browser testing; `20261107020300` scopes it and the real API flow passes.
- [x] Independent sessions prove both selection/archive interleavings; SQL tests cover exact retry after a later save and archive, deterministic reserved-choice fallback and unpublished exclusion.
- [x] Strict server query/action and the admin form provide bounded candidate selection, ordering, navigation protection, save, exact uncertain retry and explicit conflict recovery. Focused unit tests pass; desktop save and desktop/mobile read/selection flows pass. The mobile write case is skipped because the projects share one singleton configuration.
- [x] Complete final review and cohesive commits, then open [PR #44](https://github.com/dylandrozario/the-gavel/pull/44) directly against main. Local checks passed: 1,478 pgTAP assertions, 600 unit tests, 43 concurrency cases, three desktop/mobile browser cases, schema lint, types and targeted lint/format. Twelve focused tests passed again after navigation-guard changes. Clean rebuild and hosted CI remain pending.

**Acceptance:** Only eligible active administrators can save valid ordered published-article selections. Missing or ineligible selections resolve according to the owner's confirmed fallback rule. Each changed save records one bounded audit event; exact retries do not duplicate effects.
