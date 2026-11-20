# Area 2 review: staff and roles

Quick run (security, business logic, architecture, testing; Sonnet, read-only) on commit `580036a`. No privilege-escalation path found. Every membership and invitation function checks the active administrator, uses an empty search path, and is granted to `authenticated` only; direct table writes are revoked; the last-administrator guard counts only eligible, active administrators and is serialized by the advisory lock and Auth row locks; receipts are per actor. Owner approved the findings and plan. Batch 7 fixes are implemented locally on `fix/staff-role-hardening`; focused and global validation is in progress. No changes are published. Raw reports were saved in the reviewer's checkout (`docs/code-reviews/raw/area2-*.md`, not committed).

## Findings (consolidated)

| ID | Severity | Finding | Sources |
| --- | --- | --- | --- |
| S2-01 | Medium | The membership audit does not record the role granted, so a promotion cannot be told from a demotion, a claim does not show its role, and reactivation is logged as a first approval. Fix: nullable `detail jsonb` written by the membership and invitation functions and returned by the audit reader; a `membership.reactivated` action. | SEC-001, LOGIC-002, ARCH-002 |
| S2-02 | Medium | The role list is hand-copied in about 20 places (SQL literals, zod enums, TypeScript unions, UI options, labels, pills, CSS). It already drifted once (`editor` was rejected until a later migration). Fix: `enum_range` in SQL; one exported `STAFF_ROLES` constant deriving the zod, union, label and option lists. | ARCH-001 |
| S2-03 | Medium | The sole administrator who demotes or deactivates themselves is told "This changed elsewhere. Reload": the database returns `conflict` for both a stale version and the last-administrator guard. Fix: a distinct `last_administrator` code, or disable those controls when the count is 1. | LOGIC-001 |
| S2-04 | Low | `claim_invitation` can reactivate a deactivated member from a stale live listing (reachable by deactivating someone whose listing is still live), logged as a claim. Fix: mark the listing claimed and leave the membership alone, or retire the listing when deactivating. | SEC-002 |
| S2-05 | Low | `invite_staff` lets an entry with a missing `role` through validation (the check evaluates to NULL); a direct call fails with a raw error. Fix: add `or (entry ->> 'role') is null`. | ARCH-004 |
| S2-06 | Low | Bulk add reports "Added 0" for addresses already listed with the same role and does not name role overwrites; granting Administrator needs no confirmation, including for up to 200 entries. | LOGIC-003, LOGIC-004 |
| S2-07 | Low | `parseInviteText` refuses a whole batch of "Name <email>" lines with a misleading error and silently drops some names; extra or repeated query parameters break the Memberships and Activity pages (strict schema); a person's activity omits events from earlier listings of their address; the add form stays locked after `unavailable`. | LOGIC-005, 006, 007, 010 |
| S2-08 | Low | Display names accept invisible and bidirectional format characters (cosmetic byline spoofing, administrator input only). Fix: also reject `\p{Cf}` in SQL and zod. | SEC-003 |
| S2-09 | Low | Approve with a null version can create a membership for any eligible Auth user, listed or not; the docs say unlisted people are not stored. The UI never uses it. Fix: reject or document. | ARCH-008 |
| S2-10 | Low | Invitations table lacks state-consistency checks (`claimed_*` with `removed_at`), and `parseInvitationResult` does not compare id, role and version to the command like the member parser does. | ARCH-009 |
| S2-11 | Info | Documentation drift: `data-model.md` still describes two roles, defaults and receipts and lacks the invitations table; `api-contracts.md` omits `editors` in `staff_summary` and `p_subject`; `product-requirements.md` still lists contributor management. | LOGIC-009, ARCH-005 |
| S2-12 | Info | `list_staff` and `staff_summary` do per-row eligibility work and several scans; the advisory lock is held through the whole 200-entry loop; `audit_events` check constraint is rebuilt in about nine migrations; `membership_write_receipts` has no retention. Needs `EXPLAIN` at about 5,000 members before acting. | ARCH-006, 007, 010 |

## Test gaps (testing review, High and Medium)

No test sends `editor` through the membership and invitation functions (`022`, `062`, Vitest, Playwright all lack it); no pgTAP denial tests for non-administrators on `change_membership_role`, `deactivate_membership`, `change_invitation_role`, `remove_invitation`; last-administrator cases missing (invited administrator, inactive administrator, demotion to editor, two administrators deactivating each other); no invitation race scripts; no unit test for the invitation command parser; per-operation audit assertions, `request_conflict` and stale-version cases, directory search, filter, pagination and count tests, bulk invite edge cases and UI states (conflict, cancelled confirm, retry after uncertain failure) are thin. Fix as one batch of tests plus a role-matrix test driven by `enum_range`.

## Plan (batches, pending approval)

1. S2-03, S2-05, S2-08, S2-04: small database and UI fixes with tests (one migration).
2. S2-01 with a migration, the audit reader and the activity page.
3. S2-02: single source for roles (touches many files; do after 1 and 2 to avoid conflicts).
4. Test batch and S2-06, S2-07, S2-09, S2-10.
5. Docs (S2-11), then measure S2-12.

Decisions needed from the owner: whether granting Administrator should require confirmation (S2-06), and whether the null-version approve path should be removed (S2-09).
