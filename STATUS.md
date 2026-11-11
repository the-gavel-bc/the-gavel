# Current work

- Phase: PR #81 conflict resolution against main `ede546d`, which includes PR #79.
- Branch/PR: `fix/review-recovery-cleanup`; PR #80 remains separate.
- Plan: [recovery and cleanup](docs/superpowers/plans/2026-11-11-recovery-cleanup-fixes.md).
- Preserve cleanup fairness, explicit upload cancellation and definitive conflict recovery alongside main's processing admission and unused-upload cleanup.
- Decisions: no automatic expiry; retain uncertain receipts on access/missing-resource denials and permanently clean retired upload keys.
- Hosted CI and human maintainer review remain required before merge.
