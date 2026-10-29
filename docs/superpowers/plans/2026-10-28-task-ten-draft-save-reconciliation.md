# Task 10 Draft Save Reconciliation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with the preserved native execution method. Implement test-first in focused commits, request one fresh whole-branch review, then stop at the Task 10 owner checkpoint.

**Goal:** Preserve the newest in-memory edits across delayed/uncertain saves, support safe stale-version recovery, and warn before supported navigation loses unsaved work.

**Architecture:** Extract a pure save-state reducer, keep the form controller as the action adapter, and add guarded conflict reads plus a local recovery panel. A dashboard-scoped navigation context shares only a leave-check callback, never article content. Existing server authorization, atomic mutation RPCs and private rendering remain authoritative.

**Tech Stack:** Existing Node 22, pnpm 11.25.0, React/Next.js App Router, Tiptap, TypeScript, CSS Modules, Vitest, Playwright and local Supabase. No new dependency, schema, grant, service or migration.

**Spec:** [Accepted private-draft contract](../specs/2026-10-22-private-draft-workflow-design.md#list-and-save-interaction); [parent Task 10](2026-10-22-phase-three-private-drafts.md#task-10-complete-saveconflictnavigation-interaction).

**Baseline/status:** Implemented and locally verified; owner review and hosted CI remain outstanding. Based on `main` at `3de2b3b` after merged PR #24. Task 9 head `64afe7d` passed hosted foundation CI. Worktree `/private/tmp/the-gavel-task10`, branch `feat/draft-save-reconciliation`. See [actual evidence](../../testing.md#phase-3-task-10-save-and-conflict-recovery). Locked dependency installation and required local gates completed.

## Global constraints

- Explicit Save only; no autosave, persistent draft storage, automatic retry queue, force overwrite, automatic merge or crash-recovery promise.
- A pending command is an immutable canonical payload/request UUID/expected-version snapshot. Retries use that exact command, even if the user continues editing or later loses access. No new mutation command until the pending result is resolved.
- Keep latest input, acknowledged input, committed resource/version and pending command separate. Late replies cannot replace newer edits or falsely mark them saved.
- Preserve metadata, NULL/body behavior, association limits, deliberate unavailable-selection repair, active-reference checks and owner/admin/credited-non-owner denials. No lifecycle or auth changes.
- All draft content and recovery copies stay in component memory. The navigation context contains only leave-check state; never content, tokens, persistence or authority.
- Preserve unsupported native editor input until deliberately corrected/replaced. Valid pending retries must not be blocked by a newer invalid body or newly invalid selections.
- Preserve populated database evidence; do not reset shared local Supabase. Tests use reserved collision-checked fixtures and actor-scoped cleanup.
- Use meaningful Conventional Commits targeting at most 300 changed text lines; include relevant tests/docs. Record actual gates and outstanding human/hosted checks.

## Chosen interaction and alternatives

Retain local edits when a conflict occurs and offer **Review latest saved version**. Fetch the current authorized detail/options without replacing the form; show latest metadata, association labels and a safe plain-text body preview alongside local values. **Load latest saved version** requires an explicit discard confirmation. It adopts the returned version/input and keeps the former local values in a read-only, in-memory reference panel for manual re-entry. Do not expose a button that simply attaches the new version to the old payload. A failed, stale, hidden, read-only or unsupported reload leaves local work intact and disables inappropriate saves.

A blind page reload would discard edits before comparison. Automatic merging or a generic diff engine would add a separate conflict policy and dependencies. Neither is needed for the accepted explicit-save contract. A later concurrent write still produces another normal version conflict.

For app links use Next.js's supported `Link.onNavigate` and a small leave-check context; sign-out asks before its existing server action executes. Full-document reload/close uses best-effort `beforeunload`. Preserve modifier/new-tab clicks and same-page error/skip anchors. No history sentinel, internal router patch or claim of universal navigation interception. Same-document browser Back/Forward has no guaranteed prompt in this design; document that limit explicitly. Guaranteed history blocking would require a separately reviewed navigation design.

If a create succeeds while newer edits exist, stay in the mounted form, switch subsequent commands to save the created article/version, and show that newer edits remain unsaved. Navigate to the edit URL only after a confirmed save leaves no newer changes, or after a deliberate guarded leave. This avoids losing edits during create-to-edit navigation.

## Review focus

1. A late success or exact replay acknowledges only its submitted input; newer metadata/body/selections, including invalid native input, remain unsaved (packages 1–2).
2. Double submit, dropped committed response and later forbidden responses cannot create new UUIDs, duplicate history or submit newer input as a retry (1–2, 5).
3. Conflict review/discard cannot silently replace local edits, downgrade versions, or use hidden/read-only/unsupported data as an editable reload (1, 3, 5).
4. Navigation and sign-out cancellation happen before losing input/session; dirty guards are scoped, cleaned up and safe without JavaScript (4–5).
5. Create success with newer edits keeps the created article identity and newest input instead of navigating away or issuing another create (1–2, 5).

## Package 1: pure save-state transitions

**Files:** Create `src/lib/articles/draft-save-state/draft-save-state.ts` and `.test.ts`, plus owned fixture/equality helpers only if required for clarity.

**Interfaces:** Export `DraftSaveState`, `DraftSaveEvent`, `createDraftSaveState(input:DraftInput,article?:DraftArticle):DraftSaveState`, `reduceDraftSave(state:DraftSaveState,event:DraftSaveEvent):DraftSaveState`, and `isDraftSaveDirty(state:DraftSaveState):boolean`. Export `DraftArticle` from this owner and reuse it in the controller. State holds current/acknowledged input, committed resource, immutable pending command, phase, uncertainty and last result. Events are `edit` with input and optional native-invalid flag, `submit` with the exact checked create/save command, `resolve` with requestId/result, and explicit `reload` with checked editable detail. Caller actions create UUIDs; the reducer performs no network/random/time effects.

- [x] RED tests pin edit→submit→new edit→late success, mismatched response ID, immutable retry after edits/access errors, no-op/replayed success, double-submit rejection, changed-command UUID/version, canonical association equality, stale-tab conflict and explicit reload. Include create success retaining a resource while newer input remains dirty and an invalid native body not represented by canonical input.
- [x] Run `pnpm exec vitest run src/lib/articles/draft-save-state`; expect missing-module RED. Implement transitions; same command stays pending across uncertainty and subsequent errors. Definitive first failures clear only that command and preserve latest input. Native-invalid input is never marked saved merely because the last valid canonical body matches a receipt.
- [x] Run focused GREEN tests and commit `feat: model draft save acknowledgement and retry state` in independently testable increments.

## Package 2: controller and editable-in-flight form

**Files:** Update `src/components/dashboard/draft-form/use-draft-command.ts`, `.test.ts`, `draft-form.tsx`, `.test.tsx`; adjust `draft-editor/` implementation/tests only for demonstrated external-reload/native-invalid state needs.

**Interfaces:** Preserve `useDraftCommand(initialDraft,article?)`; extend its result with committed resource, pending-command/uncertainty state and explicit reload dispatch. Keep a synchronous latest-state ref so immediate saves see the last native input before React renders. Actions remain `createDraftAction`/`saveDraftAction` with existing command shapes. The form reports editor-invalid state to the reducer without coercing invalid content into a valid payload.

- [x] RED controller/component tests prove input remains editable during a save, Save cannot start a second command, uncertainty exposes **Retry original save**, newer invalid input does not obstruct an exact valid retry, and successful acknowledgement leaves newer edits dirty. Cover invalid/slug/rate/access failures without input loss.
- [x] Replace duplicate local phase/baseline bookkeeping with the reducer. Snapshot one canonical command at submit, route only its matching reply to resolution, retain the same pending command through all uncertain retries and allocate a fresh UUID only for a deliberate new command after resolution.
- [x] Derive create/save mode from committed resource rather than only initial props. Preserve newer create input in the mounted form; save it to the acknowledged resource before automatic edit-route navigation. Keep semantic status/error announcements and avoid focusing a delayed save result away from active typing unnecessarily.
- [x] Run `pnpm exec vitest run src/components/dashboard/draft-form src/components/dashboard/draft-editor`; expect GREEN. Commit controller and form integration separately where needed to keep commits small.

## Package 3: conflict review and deliberate reload

**Files:** Create `src/lib/articles/draft-reload-action/draft-reload-action.ts` and `.test.ts`; create `src/components/dashboard/draft-conflict-panel/` named implementation/CSS/tests; integrate the existing form and options/category ownership.

**Interfaces:** `reviewDraftAction(articleId:string):Promise<{ok:true;detail:DraftDetailResult;options:DraftOptions|null}|{ok:false;code:"invalid_input"|"forbidden"|"unavailable"}>` independently verifies access and uses existing private guarded queries. Options exist only for editable details. `DraftConflictPanel` consumes the current local input, checked latest detail/options and explicit review/load callbacks. The controller applies `reload` only after confirmation and only to the same article with no unresolved mutation. Copy/show body as safe text, never raw HTML or editor-native JSON.

- [x] RED tests cover owner/admin reads and credited non-owner denial, malformed ID, safe transport errors, unauthorized/hidden/read-only/unsupported targets, stale response IDs and local edits made while review loads. No broader lookup or service-role client.
- [x] Implement request-scoped latest reads; retain existing local state on failure or non-editable results. Prevent stale review responses from replacing a newer review. An editable review offers comparison and explicit load; confirmation names the draft and loss of active local changes. Do not resolve a pending unknown write through an ordinary detail read.
- [x] On deliberate load, adopt latest input/version/options together, clear incompatible editor error state and refresh category choices for the adopted section. Retain the prior local snapshot only as an in-memory read-only reference; no automatic reapply/merge or force-save shortcut.
- [x] Run focused action/panel/form tests; expect GREEN. Commit `feat: review and deliberately reload conflicting drafts` in focused action/panel/integration increments.

## Package 4: supported navigation and sign-out protection

**Files:** Create `src/components/dashboard/draft-navigation-guard/` provider/hook/tests and `guarded-dashboard-link/` implementation/tests; create `dashboard-sign-out-form/` implementation/tests; integrate `dashboard-shell/`, `src/app/(dashboard)/dashboard/layout.tsx` and the form's Back link. Add companion layout tests if needed.

**Interfaces:** `DraftNavigationProvider({children})` owns only a leave-check callback registration; `useDraftNavigationGuard(shouldWarn:boolean)` registers/cleans it up. `GuardedDashboardLink` retains Next Link props and calls the guard from `onNavigate`. `DashboardSignOutForm({action:()=>Promise<void>})` preserves the existing server action/native form behavior and checks before a JavaScript submit. Use one short native confirmation prompt for deliberate leave and one best-effort unload handler.

- [x] RED tests cover dirty/pending/uncertain/native-invalid input, clean/confirmed saves, cancel/confirm link and sign-out, new-tab modifiers, same-page error anchors and cleanup after navigation/unmount. Server authorization and no-JS sign-out remain unchanged; canceled sign-out sends no request.
- [x] Wrap the existing server-rendered dashboard children in the minimal client provider and replace only actual dashboard leave links/sign-out presentation. Registration contains no draft content and does not change server guards. Successful automatic create-to-edit navigation occurs only after the current input is acknowledged; it must not trigger a spurious leave prompt.
- [x] Run focused shell/guard/link/sign-out/form tests and strict types/build; expect GREEN. Record the Back/Forward coverage limit; do not add internal router interception.

## Package 5: adversarial browser proof and handoff

**Files:** Create `e2e/drafts/draft-save-recovery.spec.ts`; extend existing reserved fixture helper with isolated `save` actors as needed. Update affected README/API/component/security/testing docs, ADR 0007 implementation evidence and parent Task 10 status only after verification.

- [x] Desktop/mobile journeys delay a real successful response, edit metadata/body/selections during the delay and prove the first snapshot alone was stored; newest local input remains dirty and a second explicit save persists it.
- [x] Drop a committed create/save response, edit local input, double-click/retry across access revocation/restoration and prove exact request-body/UUID/version reuse and single revision/audit/receipt capture. Create-with-newer-edits must not issue a duplicate create or navigate away prematurely. Reuse the existing route.fetch→abort technique with deterministic barriers, not sleeps.
- [x] Two independent contexts edit the same article: first saves, second conflicts, local data survives latest-version review, canceling reload retains input, explicit load adopts the current version, and a later save remains version-checked. Include owner/admin and credited-author-B denial plus unsupported/read-only/unavailable selections on recovery.
- [x] Verify dirty/uncertain/native-invalid app-link and sign-out cancellation, clean navigation, best-effort reload warning, keyboard focus/error/status behavior and mobile overflow. Record desktop/mobile recovery screenshots and honest browser-history limitations.
- [x] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:types:check`, `pnpm supabase db lint`, `pnpm test:draft-contract`, `pnpm test:draft-editor`, `pnpm test:draft-concurrency`, and `pnpm exec playwright test` (configured production build/start). Expect exit 0 and no regression from the 431-unit/1,075-SQL/216-parity/60-browser baseline. Run unfiltered production/full high audits and `git diff --check`; record actual results.
- [x] Compare pre/post original-row fingerprints without resetting. Fresh whole-branch review fixes Important/Critical findings with observed RED→GREEN tests and relevant full regression gates. Retain evidence privately for Task 11; label unavailable hosted/human/manual checks honestly.
- [x] Commit the implemented behavior/evidence in small meaningful commits and stop for owner review. Do not merge, open a PR or begin Task 11 without the next instruction.

## Planning review and boundaries

This subplan fills the parent reducer/controller/recovery/navigation work package without changing database interfaces or the accepted explicit-save policy. Proposed UI choices for owner review are: explicit compare-then-load recovery with a read-only local reference, retaining a created resource on the new-draft page while newer edits remain, and supported-link/sign-out protection with best-effort unload warnings rather than guaranteed same-document history blocking.

Framework references: [Next Link onNavigate/navigation blocking](https://nextjs.org/docs/app/api-reference/components/link#blocking-navigation) and [useRouter refresh semantics](https://nextjs.org/docs/app/api-reference/functions/use-router). Check the pinned installed API/type surface before implementation; `router.refresh()` alone must never be treated as a command to overwrite retained client form state.

Rollback reverts only the new application consumers and restores the previous locked-input controller. Keep stored article/history/receipt records and mutation controls; no destructive rollback is proposed. Task 11 whole-slice upgrade/clean-install/security handoff and existing human/provider/client-question carry-forwards remain separate.
