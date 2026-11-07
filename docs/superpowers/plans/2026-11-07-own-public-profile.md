# Own Public Profile Implementation Plan

**Goal:** Let an eligible active member edit only their own public display name and plain-text biography while preserving generated author URLs and access boundaries.

**Basis:** [Phase 4 contract](../specs/2026-11-01-editorial-workflow-design.md), [Task 12](2026-10-29-phase-four-editorial-controls.md), and Task 10's profile/slug protections. Branch from main after taxonomy integration PR #42.

## Decisions and risks

- A parameterless own-profile reader and a strict own-save RPC derive the profile exclusively from `auth.uid()` and an active eligible membership/profile. They accept no profile ID, Auth link, role, slug, or audit fields. Administrators use the same own-only boundary here.
- Save checks expected profile version, serializes with membership changes and profile publication/slug allocation using the existing lock order, and retains the generated slug after publication. It captures a bounded `profile.updated` audit and an actor/request-bound receipt atomically. No-op writes produce only a receipt. Uncertain responses retain their exact request through subsequent failures; stale versions offer reload without silently overwriting input.
- Task 3's image media is article-scoped and does not safely support profile references; profile image selection remains unavailable until a separate approved media slice. Public author routes remain Phase 5.
- The local database is preserved. Forward migrations extend the existing receipt operation allowlist and expose narrow read/save functions without opening direct profile writes. Existing profile and article rows remain unchanged.

## Slices and checks

- [x] Database tests cover own read/write, author/admin paths, anonymous/inactive/ineligible denial, no target ID, slug follow/freeze, stale/no-op/replay/request mismatch and audit. Strict application tests reject protected-field injection. Independent sessions cover administrator conflict, publication freeze, and identity revocation.
- [x] Strict server query/action and `/dashboard/profile` editor use native fields, no slug or identity input, validation, explicit save, conflict recovery and exact retry. Focused unit and desktop/mobile cases pass; the form explains its JavaScript dependency.
- [x] Status, final diff review and cohesive commits are complete; [PR #43](https://github.com/dylandrozario/the-gavel/pull/43) targets main. Local checks passed: 1,441 pgTAP assertions, 590 unit tests, 40 concurrency cases plus three focused races after the identity lock, four desktop/mobile browser cases, TypeScript, lint, schema lint and generated types. Clean rebuild and hosted CI remain pending.

**Acceptance:** Only the currently eligible active member can read and edit their linked public profile. Their public name and biography change without modifying Auth, membership, another profile, article ownership, or frozen published slugs.
