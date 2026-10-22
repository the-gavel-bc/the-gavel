# Phase 3 private drafts — task planning draft

**Status:** Requested private-draft scope is being planned. Task 0 is verified; Task 1's proposed design and unresolved contract choices await owner review. This is a work-package breakdown, not an approved executable implementation plan. Tasks 2–11 are not implemented; their technical details remain proposals pending the contract.

**Goal:** Let eligible active authors create/edit/save/reopen private drafts, with owner/admin enforcement, validated content, and atomic revision/audit capture. Preserve the Phase 2 schema/read boundaries and all closed operations outside the accepted new mutation interface.

**Design for review:** [Proposed contract](../specs/2026-10-22-private-draft-workflow-design.md). [Product](../../product-requirements.md), [API](../../api-contracts.md), [data](../../data-model.md), [security](../../security-and-permissions.md), [style](../../coding-style.md), [testing](../../testing.md).

**Execution agreement:** The owner requested planning followed by work on each task. Preserve the native execution approach and focused commits/task-completion notifications already used. Review the concrete contract and then the exact execution plan before opening new write authority or installing an editor. Once a task is ready, do not request permission again for its routine implementation steps. Preserve owner review checkpoints and unrelated screenshots/worktree content.

## Task 0 — verify the baseline: complete

- [x] Existing linked worktree clean before planning; create `docs/phase-three-draft-workflow` from `origin/main` at `bb86c0e`.
- [x] Foundation/content schema integrated through history migration `20261021040000`; no new product source/dependency/migration is changed by planning.
- [x] Hosted main run [39694091516](https://github.com/dylandrozario/the-gavel/actions/runs/39694091516) succeeded on exact `bb86c0e`.
- [x] Recheck [39694304541](https://github.com/dylandrozario/the-gavel/actions/runs/39694304541): completion-doc head `be4bdd6` passed. PR #14 remains open as of the baseline check; its documentation is not claimed merged into this planning branch.
- [x] Run `pnpm db:types:check` and `pnpm test:db` under Node 22: types match and all 648 assertions pass.

Independent human review, session issuance/refresh/logout coverage, hosted provider setup, and the CI-only audit exception remain separate carry-forwards. No solo-maintainer exception or resolved client TODO is inferred.

## Task 1 — finish the draft contract: in progress

**Files:** Proposed design above; then exact implementation plan, affected API/security/data docs, and an ADR if the owner accepts the new editor/write-boundary choices.

**Work:** Compare Tiptap/Lexical and explicit Save/autosave; review the concrete proposed format/version/URL/bounds, supported extensions, RPC envelopes/privileges, active identity/ownership/status checks, snapshot capture, private idempotency/quota storage, version/no-op behavior, inactive selections, paging and rates in the design appendix. Preserve required Phase 2 limits and deferred lifecycle/media/client decisions.

**Acceptance:** Owner reviews a concrete written contract, with every new choice visibly proposed until accepted. The resulting implementation plan names exact files, migrations, function signatures, error codes, limits, tests, and commit boundaries; no unresolved security/API choice is delegated to coding judgment. Select compatible package versions before installing them. All appendix choices remain proposed until owner review; save-mode preference is still pending. They are not treated as implemented TODOs.

**Validation:** Source/contract consistency, focused formatting and relative links; compare against architecture/permissions and established colocation. No runtime feature claim comes from a document.

## Proposed work packages after Task 1

Names/locations below reserve responsibility, not an immutable API or installed module. Exact migration timestamps and interfaces must be finalized in the accepted executable plan. Each implementation task follows test-first RED/GREEN and includes affected docs/types; do not write production code from this provisional task map.

### Task 2 — authoritative content and request validation

**Planned locations:** Private SQL validation helpers in a new migration; `supabase/tests/009_draft_validation.test.sql`; `src/lib/articles/draft-contract/` for typed request validation and fixtures.

**Outcome:** Validate the approved versioned body, node/mark/attribute/URL grammar, nesting/expansion/size limits, metadata and association envelopes. Direct callable database requests receive the same security checks as server submissions. No broad table grants or editor installation yet.

**Proof:** Unknown fields/nodes, unsafe protocols/attributes, malformed/deep/oversized documents and association duplicates/limits fail; legitimate serialized editor fixtures pass. Existing 648 assertions remain green. Check schema lint, types, and focused unit/SQL suites.

### Task 3 — safe draft create transaction

**Planned locations:** Additive version/request-history prerequisites and create operation migration; `supabase/tests/010_create_draft.test.sql`; regenerated database types.

**Outcome:** Derive owner/actor, validate eligible active profile/membership and payload, create only a draft, attach consistent associations, capture revision and audit together, and handle duplicate/concurrent create requests according to the accepted retry contract. Keep all direct table writes closed.

**Proof:** Anonymous/ineligible/inactive and forged owner/status/actor requests fail. Duplicate requests do not create duplicate articles/history. Induced association/revision/audit failure leaves no partial row. Preserve existing rows on upgrade.

### Task 4 — versioned atomic draft save

**Planned locations:** Save operation migration and `supabase/tests/011_save_draft.test.sql`.

**Outcome:** Lock/check the target draft, caller authority and expected version; safely replace associations and content; capture complete history; enforce replay/no-op semantics. Published/archived writes, reassignment and extra history endpoints stay closed.

**Proof:** Two-tab stale saves and duplicate-request races behave deterministically; conflicts and induced capture failures leave article/associations/history unchanged. Owner A/B, credited identities and administrator checks exercise direct operations. Old Phase 2 SQL assertions stay green.

### Task 5 — server query/action boundary

**Planned locations:** Colocated `src/lib/articles/draft-queries/`, `draft-actions/`, and existing access/client helpers; generated types remain in their current folder.

**Outcome:** Typed bounded owner-list/detail reads and create/save actions using verified access and user-scoped clients. Stable errors, private/no-store behavior, request identity and version propagation; no service-role client or raw error leakage.

**Proof:** Guard independently at entry points, safely map forbidden/not-found/validation/conflict/retry errors, prevent pagination abuse and protected field acceptance. Test direct action calls without relying on hidden UI controls.

### Task 6 — My Articles listing

**Planned locations:** Existing dashboard route; `src/components/dashboard/article-list/` with owned styles/tests; focused browser suite under `e2e/drafts/`.

**Outcome:** Owned-article listing with accepted bounded pagination, meaningful empty/loading/error states, and draft links/create entry. Administrator all-content management remains a separate future screen.

**Proof:** Exact owned records, no cross-owner leak, stable paging, keyboard semantics and desktop/mobile layout. Keep server reads and interaction responsibilities separate.

### Task 7 — new draft form

**Planned locations:** Planned new-article route; `src/components/dashboard/draft-form/` with companion CSS/tests.

**Outcome:** Required title/section/slug plus accepted optional fields; explicit slug collision and validation feedback; create request replay protection and navigation to the committed draft. Synthetic local catalog fixtures enable review without selecting real unresolved labels.

**Proof:** Create/reopen through the browser; denied callers cannot invoke create directly; failed/uncertain requests preserve form input and use accepted retry semantics. Persistent labels, linked errors and announced results.

### Task 8 — body editor and edit route

**Planned locations:** Planned article detail route; `src/components/dashboard/draft-editor/`, `draft-toolbar/`, and `src/lib/articles/draft-document/` adapter, each with owned companions. Editor packages/lockfile only after the accepted choice and compatibility/audit check.

**Outcome:** Accepted formatting only, validated load/serialize/reopen behavior, isolated client editor, and server-owned persistence. No arbitrary HTML injection, silently dropped legacy content, media, or unsupported extensions.

**Proof:** Round trips against authoritative validator; safe paste/link and unknown-version handling; keyboard toolbar/focus, hydration and mobile checks. Existing malformed objects are rejected safely, not silently overwritten.

### Task 9 — taxonomy and contributor selection

**Planned locations:** Colocated `draft-taxonomy-fields/` and `draft-contributor-fields/`, integrated with the existing draft form and accepted query layer.

**Outcome:** Select existing permitted taxonomy/profiles; explicit same-section category behavior and accepted inactive-selection policy; multiple credit roles and order ties without authority. No free-form tag creation or contributor/taxonomy administration.

**Proof:** Section changes cannot retain invalid category links; invalid/stale selections fail atomically; real credited B cannot edit A; guest contributor selection works. Test role denials and retained unsaved selections on error.

### Task 10 — save, conflict and unsaved-change interaction

**Planned locations:** Owned draft-form/editor controller and small colocated save-status module if justified by reuse.

**Outcome:** Accepted explicit-save or autosave behavior, correct dirty state during in-flight edits, transport/retry recovery, stale-version feedback and deliberate navigation behavior. Implement basic feedback with each earlier form task; this task finishes cross-field/concurrent behavior rather than adding all error handling at the end.

**Proof:** Delayed-response edits remain dirty; duplicate clicks/lost responses replay safely; stale tabs retain local work; network failures preserve inputs; saved/dirty/error states are accessible. No silent force-overwrite or browser persistent storage.

### Task 11 — integrated verification and handoff

**Planned locations:** Affected docs and focused SQL/unit/browser suites; private upgrade evidence remains ignored.

**Outcome:** Verify populated-schema upgrade before clean reset; full role/ownership/adversarial/rollback/concurrency journeys, types and documentation match actual behavior. Fresh whole-slice security review and recorded human-review/manual accessibility gaps.

**Proof:** Focused SQL plus complete `pnpm test:db`, database lint/type drift, format/lint/types/unit/build/desktop-mobile browser checks, secret/dependency scans, and exact-head hosted CI. Preserve the only existing audit exception; a new finding blocks the dependency change until reviewed. No new hosted project is required for synthetic local proof.

## File ownership and dependency order

Task 1 produces the binding contract for all later tasks. Task 2 validation is consumed by Tasks 3/4 and the editor adapter. Task 3 create infrastructure is consumed by Task 4 retry/version logic and Task 5 actions. Task 4 save atomicity is consumed by every later form feature. Task 5 reads/actions feed Tasks 6–10. Task 11 verifies all paths together. Task-local tests and denial coverage ship with each migration/interface, not only Task 11.

Routes follow Next.js conventions under `src/app/(dashboard)/dashboard/`; component/module files follow the owner's named-folder colocation preference. Shared UI primitives are reused rather than introducing a component framework. No abstraction, dependency, renderer, or provider is added solely for hypothetical future use.

Stop after each completed task and notify the owner for review as previously requested. Unresolved choices stop their dependent implementation, while independent documentation/research/baseline work continues. The proposed plan does not authorize publishing, archive/restore/delete, reassignment, media, or public URL changes.
