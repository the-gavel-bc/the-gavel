# Phase 4 E2E Repair

**Goal:** Make the stacked Phase 4 PR checks reflect the accepted published-edit contract and reliably test draft saves.

## Causes and scope

- Existing no-JavaScript test expects old draft-only copy; the form now says article changes.
- Published articles are editable in Task 5. Existing read-only checks must use archives; published editing remains covered by its dedicated browser test.
- Several browser cases act on the editor before observing React's committed dirty state. Wait for the visible unsaved state before submitting, preserving the behavior assertions.
- A successful save revalidates the editor route. Its version-based React key remounts the form and discards local edits made while the response was held. Keep identity/status in the key, and let the existing save-state reducer reconcile the new version. The late-save browser case is the regression proof.

## Acceptance and proof

- [ ] Update stale copy/status assertions and prove archived access is read-only.
- [ ] Add state synchronization in failing save/recovery/selection flows; preserve version, audit, retry and local-input checks.
- [ ] Run focused desktop/mobile failures, then the full local E2E gate once.
- [ ] Push minimal commits to PRs #32, #33 and #34 without rewriting shared history.
