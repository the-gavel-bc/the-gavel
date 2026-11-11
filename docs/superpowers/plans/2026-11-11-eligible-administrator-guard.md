# Eligible administrator guard implementation plan

**Goal:** Fix review finding 24 without changing the approved Google-only identity policy.

**Architecture:** Add a private user-ID eligibility predicate and reuse it from the existing session predicate, membership target validation/counts and trusted-media eligibility. Replace functions through an additive migration; preserve public signatures, grants, receipts, ownership checks and media lock ordering. The latest contributor-profile function already refuses deactivation of every active member-linked profile, so do not restore its superseded administrator-count code.

**Spec:** [Finding 24](../../reviews/phase-1-5-pr-review.md#24-75--last-administrator-guard-counts-administrators-the-new-eligibility-rule-blocks-high-pending-pr-regression), [security policy](../../security-and-permissions.md).

## Acceptance and design risks

- One Google-only administrator plus an active mixed-provider administrator must not permit self-demotion or self-deactivation. Return `conflict`; preserve membership/version and write no success audit or receipt.
- Reject mixed-provider approval/promotion. Keep confirmed `bc.edu`, primary Google and optional Google-only provider-list semantics exactly compatible, including fail-closed malformed/null metadata.
- Two eligible administrators still permit demotion/deactivation and exact receipt replay; changed payloads conflict. Authors and ineligible actors remain denied.
- Serialize membership/profile operations with the existing advisory lock. Lock actor/target and active administrators' Auth rows in UUID order, then recheck eligibility after waits; provider changes cannot invalidate a counted administrator before commit.
- Trusted begin/finalize/removal must revalidate the shared rule after existing Auth/member/profile lock waits. A mixed-provider actor receives `forbidden` without media mutation, including revocation while waiting.
- Add no public callable identity lookup, table grant, dependency, service or UI change. Accessibility is unaffected. Preserve the working local database by testing a disposable clone only.
- Rollback restores prior function definitions and closes the new helper; doing so reintroduces finding 24. Do not rewrite historical migrations or stored data.

## Ordered work

- [x] Plan: inspect the latest effective definitions, existing SQL fixtures and concurrency transport; confirm no older profile guard is restored.
- [x] Build: add `20261111110000_identity_eligibility_consistency.sql`; define `private.has_eligible_identity_for(uuid)`, make session/media helpers delegate, and replace `private.manage_membership` while retaining existing contracts. Add focused pgTAP cases in `supabase/tests/055_identity_eligibility_consistency.test.sql` and targeted lock-wait cases under `scripts/draft-concurrency/identity-eligibility/`.
- [x] Test after implementation, as requested: run the new SQL regression against the unpatched disposable database to establish failure, apply migration, rerun it and existing identity/membership/profile/media denial suites. Run targeted concurrency cases for serialized admin removal, Auth-provider revocation during a wait and trusted-media revocation. Do not run broad suites locally.
- [x] Run types, lint, formatting and diff checks. Verify no generated public type changes. Update this plan with exact evidence and security documentation with the lasting shared-predicate rule.
- [ ] Review the completed slice independently, fix blocking findings and rerun affected checks. Commit, push a new branch and open a PR against `main`; do not merge or deploy. Hosted CI and human security review remain required.

## Verification notes

PRs 80/81 remain independent; branch starts at main `ede546d` (merged PR 79). Built the migration and focused regression cases before running tests, as requested. The effective profile deactivation function already rejects all active member-linked profiles, so it is unchanged.

A disposable `gavel_identity_20261111` database was cloned from the existing optimization scratch database and brought to main's finalization-lock definition. Before the fix, the new SQL suite failed 16 of 36 assertions; targeted pre-fix races failed three cases (missing administrator Auth lock wait and trusted begin/finalize accepting a revoked actor far enough to reach asset lookup). After applying the migration only to that clone, all 198 assertions across eight focused SQL files passed. Five additional helper-grant/actor-denial assertions then passed in the updated 41-assertion regression file, bringing focused SQL coverage to 203 assertions. Public function argument/result signatures matched before and after. Initial fixture verification corrected synthetic membership reactivation timestamps before the complete red/green run; no application behavior was changed for that correction.

All six authorization/serialization races passed. Independent review found no production-code issues, but identified a fixture-cleanup path that could skip restoring existing synthetic administrators if a session exited. A new regression reproduced `Database session already ended.`; cleanup now closes both sessions before restoring state, and all seven focused cases pass. The test-only Docker wrapper redirects only the local hardcoded psql database to the clone and is not committed.

Fourteen app access unit cases, TypeScript, full lint, full formatting, targeted documentation formatting and diff checks passed. Types and targeted lint/format were rerun after the cleanup correction. Public function argument/result signatures are unchanged; the new helper remains private with no application/service-role execution grant. No UI, accessibility surface or public API/schema contract changes. Full database/browser/security suites and human security review remain CI/release gates. No working database migration/reset, merge or deployment occurred.
