# Phase 4 integrated verification and handoff

Status: verification in progress on `docs/phase-four-verification`, starting from merged main `cd67443`. Tasks 1–15 and the source-ownership refactor are present. This document combines the Task 16 proof plan and evidence; it does not claim Phase 5 or hosted launch is complete.

## Acceptance and proof plan

- Prove a populated upgrade from Phase 3 `1285933` to this source and a clean install in a disposable project. Preserve the existing local project and its data. Compare every original column in baseline tables, including identity, article status/content/slug, associations, revisions, audit and receipts. Record intended additive backfills separately.
- Run configured format/lint/type/unit, database/contract/editor/concurrency, generated-type/schema, production build/browser, dependency and history-secret gates. Keep stateful database suites sequential. Run browser journeys against the existing fixed local synthetic fixture project; never reset it.
- Obtain a fresh whole-phase agent security/code review. Resolve demonstrated blocking defects with focused failing/passing checks; keep human maintainer approval separate.
- Use browser keyboard/forms/upload checks as automated accessibility evidence; leave screen-reader and real hosted OAuth/provider/cron/recovery checks explicit.
- Honor the owner's instruction to leave hosted CI monitoring to them. The final PR must link the required check without claiming an unseen exact-head pass. No new feature or screenshot collection is part of this task.

## Verification ledger

Pending.

## Review and remaining launch gates

Pending fresh review. Public article routes, archives/search, public media rendering and other Phase 5 work remain required for MVP. Approved video providers remain unresolved; do not silently expand the editor contract.
