# Administrator Membership Management Plan

**Goal:** Let eligible administrators approve signed-in BC Google users, change roles, and deactivate access with one trusted audit event per change.

**Basis:** Accepted [Phase 4 contract](../specs/2026-11-01-editorial-workflow-design.md) and [Task 9](2026-10-29-phase-four-editorial-controls.md). Task 8 [PR #36](https://github.com/dylandrozario/the-gavel/pull/36) is the stack base and has a green foundation check. The owner approved this onboarding rule on 2026-11-06: approval creates both a membership and linked public profile after the target's eligible Google sign-in; the administrator supplies the public display name and the database generates its slug.

## Decisions and design risks

- Scope is one existing eligible `auth.users` identity per approval. No Auth identity, email, or Google metadata is created or changed. New profiles get the supplied trimmed display name, active state, and a collision-safe generated slug; existing linked profiles retain their public fields on reapproval. Approval of an already active membership is a no-op. Role changes and deactivation require an existing active membership.
- The administrator list is a bounded, read-only view of eligible signed-in identities, with safe email, profile display name, role, and active/pending state. It never returns `profiles.auth_user_id`, Auth metadata, raw audit actor IDs, or unrelated identities. Keyset pagination and state filters are allowlisted. Pending identities have a direct approval form; existing memberships have separate role/deactivate controls.
- Narrow authenticated RPCs derive the actor from `auth.uid()` and recheck trusted Google/confirmed `bc.edu` eligibility and active administrator status after acquiring one transaction-wide membership lock. Each RPC locks its target, checks state, and writes the membership/profile plus an allowlisted `membership.*` audit event and immutable request receipt atomically. A fingerprint binds operation, target, role, and display name. Exact retries return the original result; reused request IDs with changed inputs fail. A no-op records only its receipt.
- A last eligible active administrator cannot be demoted or deactivated, including two concurrent administrators acting on each other. The membership lock serializes operations; the post-lock check counts current eligible administrators with active linked profiles. Self-change is allowed only while another remains. The UI warns before self-change. A successful self-deactivation/demotion may end dashboard access immediately; the immutable receipt prevents duplicate effects even if the browser cannot regain the former admin session to inspect it.
- The cutover migration creates the operations before revoking foundation direct membership INSERT/UPDATE/DELETE grants and policies. Existing rows and profile links are not rewritten. Older app versions have no membership management writer, so read/sign-in compatibility is preserved; rollback to direct writes would weaken auditing and requires an explicit security review. Failed operations leave no membership/profile/audit/receipt change.
- Extend the closed audit action/resource check only with `membership.approved`, `membership.role_changed`, and `membership.deactivated` on resource type `membership`. Task 8's article reader remains article-only; this task adds safe membership labels to the administrator audit page through a separately bounded reader, never exposing raw Auth IDs to the page.

## Slice A — database boundary

- [x] pgTAP covers grant/role/eligibility denial, pending approval, profile slug collision, direct-write cutover, role/deactivation, self/last-admin guard, exact replay, request mismatch, and retained timestamps. Three Task 9 files pass; the full 38-file suite passes (1,366 assertions).
- [x] Forward migrations add the closed audit allowlist, receipts, bounded candidate and audit readers, and separate approve/change/deactivate RPCs. Direct membership mutation grants and policies are revoked after operations exist. Generated types match the upgraded local schema; clean rebuild remains for CI because the local preview database was preserved.
- [x] Independent sessions prove exact duplicate approval produces one audit, stale deactivation fails, and two administrators cannot demote each other into lockout. The test starts from the single seeded eligible administrator and cleans up its synthetic second administrator.

## Slice B — server and dashboard

- [x] Strict typed commands, safe result parsing, independent server guard, original-request retry, and conflict reload are implemented. Seven focused unit/component files pass (18 tests).
- [x] `/dashboard/admin/members` provides bounded state filters/pagination, required display name and role approval, role/deactivate controls, self-change warning, and safe busy/error/retry states. The separate membership activity page uses a bounded administrator reader.
- [x] Four desktop/mobile browser cases pass for approval, role change, deactivation, activity, author denial, and invalid cursor recovery. Last-admin denial is covered by pgTAP and independent-session race checks rather than browser fixture state.

## Slice C — handoff

- [x] Update authoritative API/data/security/deployment contracts for the lasting grant and schema change; keep verification detail here and refresh `STATUS.md`.
- [x] Relevant unit, TypeScript, lint, formatting, database, concurrency, generated types, schema lint, build, and focused browser gates passed. Final diff review and nine cohesive commits are complete; [Task 9 PR #37](https://github.com/dylandrozario/the-gavel/pull/37) is stacked on PR #36. Hosted CI and human review remain pending.

**Acceptance:** Only eligible active administrators can manage memberships. Approval creates usable access and a linked public profile for an eligible signed-in person. Every state change has one audit event; exact retries do not duplicate effects. Direct application table writes are closed. Last-admin, forged, ineligible, stale, and concurrent attempts leave prior state intact. No Auth identities are created or deleted.
