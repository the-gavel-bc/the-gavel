# Task 9 Draft Selections Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with the preserved native execution method. Complete the test-first steps below, record evidence, and stop at the Task 9 owner checkpoint.

**Goal:** Let authors and administrators deliberately select and repair draft categories, existing tags and contributor credits without losing input or expanding authority.

**Architecture:** Reuse DraftForm, its in-memory command controller, the checked catalog boundary and existing atomic create/save actions. Add controlled, colocated fields and a guarded category-choice action for section changes. Preserve selected IDs even when unavailable; saving requires deliberate replacement/removal.

**Tech Stack:** Existing Node 22, pnpm 11.25.0, React/Next.js, TypeScript, CSS Modules, Vitest, Playwright and local Supabase. No new dependency or migration.

**Spec:** [Accepted private-draft contract](../specs/2026-10-22-private-draft-workflow-design.md); [parent plan Task 9](2026-10-22-phase-three-private-drafts.md#task-9-taxonomy-and-contributor-selection).

**Baseline:** GitHub main `ecf3d62`, including merged PR #23/editor head `01f1d9b`. Isolated worktree `/private/tmp/the-gavel-task9`, branch `feat/draft-association-selectors`. Implementation and local verification complete; owner handoff review and hosted CI remain outstanding. See [verification](../../testing.md#phase-3-task-9-draft-association-selection).

## Global constraints

- Preserve the accepted 32 category / 64 tag / 32 credit caps; UUID uniqueness and profile/role pair uniqueness; writer/editor/creative roles; integer display order 0–2147483647, including ties.
- Choose existing active sections/categories/profiles and existing tags only. Categories must match the active section. Guest profiles remain eligible; credit never confers edit access.
- Preserve unavailable IDs using generic labels. Do not retrieve hidden names, silently strip selections, or silently clear categories on section change.
- Explicit Save, original request UUID/payload on uncertain retry, existing pending-input lock and no browser persistent draft storage. Advanced reconciliation/navigation stays Task 10.
- Existing action/RPC validation, owner/admin checks, direct-write denials, no-store behavior and canonical body/request bounds remain authoritative.
- No publishing, media, taxonomy/profile creation, ownership/lifecycle changes, auth model changes or unresolved real content labels.
- Focused commits target at most 300 changed lines. Record actual checks and remaining human review, without claiming CI before it runs.

## Design and approach

Use native checkbox groups for categories/tags and repeated native select/number controls for credits, with explicit Add/Remove actions. This reuses semantic controls and existing tokens without a UI dependency. Show selected unavailable or wrong-section categories alongside a deliberate remove control; changing section alone never changes saved category IDs.

Load category choices on demand through an independently guarded server action. Fetching every category in the initial page would increase the initial catalog payload and change existing no-section query behavior. Full page navigation on section change would require carrying private unsaved input across navigation. Neither is needed. Keep current initial category loading; discard stale category responses after rapid section changes, show retry on failure and block saving until current choices and selections are valid.

Routine implementation choices: no custom combobox; labels distinguish duplicate display names using public profile slugs; order ties are accepted rather than renumbered; removing a credit preserves every other credit's order. No additional product decision is proposed.

## Review focus

1. Rapid section changes and failed loads cannot apply stale choices, erase categories or enable a mismatched save (work packages 1–3).
2. Previously selected unavailable sections/categories/tags/profiles remain visible and removable, with body and metadata preserved (2–4).
3. Credits support guest profiles, multiple roles and tied orders without duplicate pairs, and never grant ownership (2, 4).
4. Cap, empty catalog and pending/uncertain/error states remain keyboard usable and preserve input (2–4).
5. A catalog item deactivated after loading is rejected safely by the existing RPC; authors/admins cannot bypass active selection rules (3–4).

## Work package 1: guarded category loading

**Files:** Extend `src/lib/articles/draft-options/draft-options.ts` and `.test.ts`; create `src/lib/articles/draft-category-action/draft-category-action.ts` and `.test.ts`.

**Interfaces:** Export `loadDraftCategories(client:SupabaseClient<Database>,sectionId:string):Promise<DraftOptions["categories"]>` from the options owner and reuse it inside `loadDraftOptions`. Export server action `getDraftCategoriesAction(sectionId:string):Promise<{ok:true;categories:DraftOptions["categories"]}|{ok:false;code:"invalid_input"|"unavailable"}>`. Independently invoke the existing active-membership guard and cookie-scoped no-store client. Preserve auth redirects; return safe errors for ordinary read failures.

- [x] Write failing tests for invalid UUID, independent access guard, active category/parent filters, pagination beyond the API cap, safe query failures and unchanged initial no-section behavior.
- [x] Run `pnpm test -- src/lib/articles/draft-options src/lib/articles/draft-category-action`; expect failures for missing exports/action.
- [x] Extract the existing category query into the helper, implement the guarded action and run the same command; expect PASS.
- [x] Commit the boundary and tests together; document its read-only contract in `docs/api-contracts.md`.

## Work package 2: controlled selection fields

**Files:** Create `src/components/dashboard/draft-taxonomy-fields/` and `draft-contributor-fields/`, each with named `.tsx`, `.module.css`, `.test.tsx`. Create colocated selection-validation module/tests under `src/lib/articles/draft-selections/`.

**Interfaces:** `DraftTaxonomyFields({draft,options,errors,onChange})` consumes DraftInput, DraftOptions, Record<string,string> and `(next:DraftInput)=>void`. `DraftContributorFields({value,options,error,onChange})` consumes DraftInput["contributors"], DraftOptions["contributors"], optional error and complete-value change callback. `draftSelectionErrors(draft:DraftInput,options:DraftOptions):Record<string,string>` provides usability checks; existing validators/RPC remain authoritative.

- [x] Write failing tests for add/remove, exact caps and one over, duplicate IDs/profile-role pairs, wrong-section/unavailable selections, multiple roles, guest profiles, tied/invalid integer order and empty catalogs. Assert untouched fields/credits remain identical.
- [x] Run focused tests; expect missing modules/components to fail before implementation.
- [x] Implement native fieldsets/legends, labels, hints, associated errors and explicit removal controls; generic unavailable labels reveal no hidden catalog data. Add operations stop at caps; removal remains possible.
- [x] Run `pnpm test -- src/components/dashboard/draft-taxonomy-fields src/components/dashboard/draft-contributor-fields src/lib/articles/draft-selections`; expect PASS. Commit in focused field/helper increments.

## Work package 3: form and route integration

**Files:** Extend `src/components/dashboard/draft-form/draft-form.tsx` and `.test.tsx`; add owned category-loading hook/tests there; extend `draft-metadata-fields/draft-metadata-fields.tsx` and `.test.tsx`; update `src/app/(dashboard)/dashboard/articles/[id]/page.tsx` and companion tests.

**Interfaces:** Preserve existing DraftForm and command-hook props. Add section-choice coordination inside the form; seed categories from initial options. Metadata fields show an unavailable current section as a generic selected option. The edit route renders the form for valid canonical bodies even with unavailable associations; read-only/unsupported/not-found guards remain unchanged.

- [x] Write RED tests for changing section without category removal, deliberate removal/reselection, rapid A→B→A responses, load failure/retry, no false initial dirtiness, unavailable-ID repair, retained values after save rejection and complete save payload.
- [x] Cover pending/uncertain field locking, caps/errors linked from summary, keyboard access and no-section behavior. Block only new submissions while catalog/selection feedback is unresolved; uncertain retries must still replay the original command.
- [x] Implement category-loading state with stale-response protection and no automatic mutation of selections. Integrate controlled fields, pre-submit usability feedback and safe retry UI.
- [x] Run `pnpm test -- src/components/dashboard/draft-form src/components/dashboard/draft-metadata-fields 'src/app/(dashboard)/dashboard/articles/[id]/page.test.tsx'`; expect PASS. Commit focused integration changes.

## Work package 4: real journeys and handoff

**Files:** Create `e2e/drafts/draft-selections.spec.ts`; extend `e2e/support/draft-list-fixture/draft-list-fixture.ts` only as necessary; update affected README, component/security/API/testing documentation and the parent Task 9 checkboxes.

- [x] Add synthetic, local-only desktop/mobile create→select→save→reopen and edit→repair→save journeys. Include section mismatch preservation, failed save retention, guest/multiple-role/tied-order credits, credited-author-B denial and administrator active-selection rules. Deactivate a fixture reference after options load and assert safe rejection with retained input.
- [x] Run the new browser cases against a production build; inspect desktop/mobile screenshots and keyboard behavior. Preserve fixture fingerprints and the populated baseline; do not reset the shared database.
- [x] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:types:check`, `pnpm supabase db lint`, `pnpm test:draft-contract`, `pnpm build` through Playwright’s configured webServer, and `pnpm exec playwright test` (all browser suites). Expect each exit 0; record actual counts and any unavailable environment requirements.
- [x] Run unfiltered `pnpm audit --prod --audit-level=high` and `pnpm audit --audit-level=high`, plus `git diff --check`. Expect no blocking finding or whitespace error.
- [x] Review the whole Task 9 change with a fresh reviewer, fix important findings with observed regression tests, record evidence and outstanding human security/screen-reader review. Do not claim hosted CI, create/merge a PR or begin Task 10 as part of this handoff.

## Acceptance and rollback

Task 9 is complete when create/edit/save/reopen preserve exact permitted associations, unavailable selections require deliberate repair, rapid section changes cannot corrupt input, browser/SQL ownership denials remain green, and documented checks/screenshots support the behavior. Revert the application consumers/components/action to roll back; retain stored associations and existing migrations. Task 10 and Task 11 each receive their own planning pass before implementation.
