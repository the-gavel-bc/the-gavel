# Phase 3 Private Drafts Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the preserved native execution method. Implement task-by-task with test-first steps and owner review checkpoints.

**Goal:** Deliver private draft create/edit/save/reopen with safe content, atomic revision/audit capture, owner/admin enforcement, and conflict/retry recovery.

**Architecture:** Keep the existing user-scoped server boundary and direct-table write denials. Add bounded private validators, narrow authenticated create/save functions, private receipt/quota state, and small colocated query/action/form/editor modules. Client editor behavior never supplies authority.

**Tech Stack:** Existing Node 22, pnpm 11.25.0, Next/React/TypeScript, Zod, Supabase/pgTAP, Vitest, Playwright; accepted Tiptap integration is installed only in Task 8 after peer/license/audit checks.

**Spec:** [Accepted private-draft contract](../specs/2026-10-22-private-draft-workflow-design.md), approved by the owner on 2026-10-22. Existing [Phase 2 contract](../specs/2026-10-21-content-foundation-design.md), [API](../../api-contracts.md), [data](../../data-model.md), [security](../../security-and-permissions.md), [style](../../coding-style.md), and [testing](../../testing.md) remain authoritative for their existing boundaries.

**Status:** Tasks 0 and 1 complete as documentation/baseline work. Tasks 2–7 validation, draft create/save, server queries/actions, My Articles listing and new-draft metadata form are complete. Tasks 8–11 are not implemented. The owner requested native planning/execution followed by task-completion notifications and review checkpoints; preserve that approach. This plan refines the accepted work packages without approving any extra product scope.

## Global constraints

- Preserve Phase 2 scalar/body/snapshot bounds and all existing role/ownership denials. No applied migration edits or destructive rollback.
- Explicit Save only. No media, public projections/routes, lifecycle/reassignment, free-form tag/profile/taxonomy management, collaboration service, or browser persistent draft storage.
- Keep table writes closed, even for administrators. Only accepted authenticated create/save RPCs may write through explicit identity/profile/membership/owner/status/content checks; no service-role client.
- Follow the spec's exact JSON grammar: 1 MiB body, 2 MiB snapshot, 1,100,000-byte draft payload, depth 16, 5,000 nodes, at most three unique marks, link length 2,048, category/tag/credit caps 32/64/32. Integer storage bounds apply to order/version/start values. Reject storage-incompatible Unicode and NUL safely.
- Content byte checks must match PostgreSQL JSONB text serialization (comma/colon spaces, UTF-8 and valid string escapes), not compact JavaScript JSON length. Only accepted integer-valued number fields enter canonical payloads. Test actual DB boundaries and TS parity.
- Every new private helper/table explicitly revokes PUBLIC/anon/authenticated privileges. Grant only the two reviewed public RPC signatures to authenticated. Fixed empty search paths and fully qualified references are required on privileged helpers.
- The only audit exception remains ADR 0005; no dependency ignore is added. Real client labels, retention/deletion choices and human/pre-launch review carry-forwards stay unresolved.
- Keep each module/component with its owned tests/styles/schema/fixtures. Preserve unrelated screenshots and existing worktree files.
- Before the first migration save a private populated-baseline snapshot; apply incrementally through Tasks 2–4. Do not reset until Task 11 proves preservation. SQL fixtures roll back.
- Each task has focused commits, each targeting at most 300 changed lines, with code/tests/docs/types for its independently testable step and actual validation. Pause at the owner checkpoint after each completed task.

## Review focus

1. Calling RPC directly cannot bypass identity/profile/ownership, JSON validation or quotas; Tasks 2–4 test real callable boundaries and unchanged table denials.
2. Two simultaneous creates/saves, conflicting expected versions, and lost responses cannot duplicate history or overwrite later work; Tasks 3/4 use independent DB sessions, not only sequential mocks.
3. Caller deactivation, inactive taxonomy and unsupported legacy content cannot slip through while a save waits; Tasks 3/4 test lock/wait order and post-wait checks, Task 8 preserves unsupported content.
4. PostgreSQL serialized byte sizes, deep Unicode documents and near-limit request encoding must not diverge from client checks; Tasks 2/5/8 test real boundary payloads and DB/TS round trips.
5. Delayed saves, navigation, and stale tabs preserve in-memory edits and accurate dirty state; Tasks 7/8/10 test real desktop/mobile interactions and no forced overwrite.

## Shared verification and interfaces

Run Node 22 commands in the existing linked worktree. Migration tasks run focused SQL RED before implementation; apply with `pnpm supabase migration up --local`, then focused/full `pnpm test:db`, database lint, formatted type regeneration, `pnpm db:types:check`, unit tests, strict types, lint and formatting. Never reset away upgrade evidence. Existing 648 assertions must stay green unless a later accepted operation intentionally changes its own callable tests; earlier table-denial tests remain unchanged.

Task 2 exports `DraftInput`, `DraftDocument`, `DraftErrorCode`, `DraftFailure`, `DraftWriteResult`, `CreateDraftCommand`, `SaveDraftCommand`, `DraftCheckResult`; these use the exact camelCase fields in the spec. `DraftFailure = {ok:false;code:DraftErrorCode;fieldErrors?:Record<string,string>}`; success is `{ok:true;articleId:string;version:number;updatedAt:string;replayed:boolean;changed:boolean}`. Create command is `{requestId:string;draft:DraftInput}`; save adds `{articleId:string;expectedVersion:number}`. Database IDs are UUIDs; versions/order/start fit PostgreSQL signed integers.

## Task 0 — verify the baseline: complete

- [x] Existing linked worktree clean before planning; create `docs/phase-three-draft-workflow` from `origin/main` at `bb86c0e`.
- [x] Foundation/content schema integrated through history migration `20261021040000`; no new product source/dependency/migration is changed by planning.
- [x] Hosted main run [39694091516](https://github.com/dylandrozario/the-gavel/actions/runs/39694091516) succeeded on exact `bb86c0e`.
- [x] Recheck [39694304541](https://github.com/dylandrozario/the-gavel/actions/runs/39694304541): completion-doc head `be4bdd6` passed. PR #14 remains open as of the baseline check; its documentation is not claimed merged into this planning branch.
- [x] Run `pnpm db:types:check` and `pnpm test:db` under Node 22: types match and all 648 assertions pass.

Independent human review, session issuance/refresh/logout coverage, hosted provider setup, and the CI-only audit exception remain separate carry-forwards. No solo-maintainer exception or resolved client TODO is inferred.

## Task 1 — accept and refine the contract: complete

- [x] Record owner acceptance of the written recommended contract, including Tiptap and explicit Save; preserve publication/media/client exclusions.
- [x] Record ADR 0007 for the new controlled mutation/editor boundary without claiming implementation.
- [x] Refine every work package below with exact files/signatures, RED/GREEN assertions, commands, dependency contracts and commit boundaries. Keep package patch selection as a compatibility/audit check before installation.
- [x] Review plan/spec coverage, signature consistency, colocation and five review-focus test assignments; validate document links/formatting.

## File ownership and execution details

Migration timestamps below are reserved after checking collisions; never rename applied history. New modules live under their named folders, not barrel-only directories. All paths are planned until their owning task completes.

### Task 2: authoritative content and request validation

**Files:** Create `supabase/migrations/20261022000000_draft_validation.sql`, `supabase/tests/009_draft_validation.test.sql`; `src/lib/articles/draft-contract/draft-contract.ts`, `.test.ts`, and `draft-cases.json`; `scripts/draft-contract-check/draft-contract-check.test.ts` and `vitest.config.ts` in that same script directory. Modify root `vitest.config.ts` and package scripts for `test:draft-contract`; update API/security/testing docs.

**Interfaces:** Private immutable input-only `is_valid_draft_link(p_href text)->boolean` (false for NULL), `is_valid_draft_document(p_content jsonb)->boolean` (SQL NULL accepted), and `check_draft_input(p_draft jsonb)->jsonb` (the check-result union with canonical `value`). These helpers read no catalog/identity rows and have no client execution grants. TS exports `checkDraftInput(value:unknown):DraftCheckResult`, `isValidDraftDocument(value:unknown):boolean`, and `draftJsonbByteLength(value:unknown):number|null` plus shared types above. Structural validation precedes canonical association-ID/credit sorting; relationship existence/activation is checked under transaction locks in Tasks 3/4.

- [x] Write literal valid/invalid `draft-cases.json` cases shared by unit and DB parity tests: every allowed node/mark and parent grammar; NULL versus JSON null; unknown keys/nodes/marks/attrs; duplicate marks; headings 2/3; ordered start 1/2147483647 versus 0/fraction/overflow; unsafe link protocols/credentials/control/backslash, ASCII hosts and rejected punycode labels, IPv4/bracketed IPv6 and valid optional port. No input property is silently discarded.
- [x] Add explicit tests for 5,000/5,001 nodes, depth 16/17, 2,048/2,049-character links, 32/33 categories, 64/65 tags, 32/33 credits; duplicate IDs/profile-role pairs; role/order/type/UUID/unknown protected fields. Build exact ASCII/multibyte PostgreSQL byte-bound fixtures and test 1 MiB body and 1,100,000-byte request acceptance/one-byte-over rejection, including spaces/escapes; reject NUL/lone surrogates before storage. Unknown format/version maps to `unsupported_content`; malformed known format maps to `invalid_input`.
- [x] Run focused Vitest and SQL tests: expect missing exports/functions before implementation. Implement bounded iterative traversal with byte/depth/node guards, strict request types and deterministic canonical association sorting. SQL input functions are private invoker helpers; do not enable writes or install Tiptap.
- [x] Add the parity suite outside default unit inclusion (`scripts/draft-contract-check/**` excluded in `vitest.config.ts`); `test:draft-contract` is `vitest run --config scripts/draft-contract-check/vitest.config.ts`. Its dedicated node-environment config sets repository root and includes only its owned test, without browser setup. Normal unit tests need no Docker. Suite calls the TS checker and local `docker exec -i supabase_db_the-gavel psql -XAt` over stdin inside a rollback transaction, comparing the same fixture expectations against SQL. Never pass body SQL through shell interpolation or print fixture content. Add this command to CI after DB migration/reset and before build; its dependency is the already-required local Docker runtime.
- [x] Run focused GREEN, full shared checks and parity suite; verify no table grants/rows changed. Commit `feat: validate private draft documents and requests`.

Evidence: [Task 2 verification](../../testing.md#phase-3-task-2-draft-validation). Independent review found a malformed-punycode mismatch. The owner deferred internationalized domains; both validators now reject every `xn--` host label, with lowercase/uppercase/subdomain, document/request and international-path regression tests. No application write interface is enabled.

### Task 3: safe draft create transaction

**Files:** Create additive Task 3 migrations `20261022010000_draft_write_state.sql`, `20261022010100_draft_write_guards.sql`, `20261022010110_draft_numeric_order.sql`, `20261022010200_draft_snapshot.sql`, `20261022010300_create_article_draft.sql` under `supabase/migrations/`; create focused suites `010_draft_write_state.test.sql`, `011_draft_write_guards.test.sql`, `012_draft_snapshot.test.sql`, `013_create_draft.test.sql` under `supabase/tests/`, `scripts/draft-concurrency/draft-concurrency.test.ts` and its dedicated config; update types, test scripts/CI and API/data/security/testing docs.

**Interfaces:** `public.create_article_draft(p_request_id uuid,p_draft jsonb)->jsonb`; private `draft_write_receipts`/`draft_write_limits` per accepted spec; `articles.edit_version integer NOT NULL DEFAULT 1 CHECK >=1`. Private helpers `capture_draft_snapshot(p_article_id uuid)->jsonb`, `lock_draft_actor()->uuid` (eligible active caller profile ID), `check_draft_references(p_draft jsonb)->boolean`, `consume_draft_attempt(p_actor_id uuid)->boolean`, and `draft_request_hash(p_operation text,p_article_id uuid,p_expected_version integer,p_draft jsonb)->bytea`. Helpers have no client execution grants, and helpers reading private identity/history use fixed-search-path definer privileges only where needed.

- [x] Write pgTAP fixtures covering caller-derived owner/actor, active profile plus trusted identity/membership, NULL/valid content, associations/guest credits, exact snapshot/audit fields/correlation, version 1, and unchanged direct write denials. Force failures independently at association/revision/audit/receipt stages with transaction-local fixture triggers; assert article/associations/history/receipt all absent, with quota bookkeeping allowed by the contract.
- [x] Test invalid/unknown fields, protected identities/status/timestamps, inactive/mismatched/stale references, 30 accepted-or-invalid attempts/31st rejection, reset at 60 seconds, identical replay without quota/history growth, changed-input/operation request conflict and actor-scoped request IDs. Assert no draft/body fields in either private support table and no app SELECT/EXECUTE leakage.
- [x] Observe focused RED, then implement additive schema and function. Lock caller identity/membership/profile rows before checking active trusted state, then the caller quota row to serialize replay/quota decisions. Recheck eligibility after any wait; lock selected references before validating them. Request failures are structured results; guarded business subtransaction rolls back content/history/receipt while quota can commit. Unexpected errors return safe `unavailable`, logging only SQLSTATE/correlation privately. All direct table grants remain closed.
- [x] Hash the validated/canonical request with built-in SHA-256; receipts PK `(actor_user_id,request_id)` stores operation, article UUID, expected/result versions, payload hash, result timestamp/changed flag and creation time. No article FK on receipt resource ID; actor FKs restrict deletion. Quota row contains actor/window start/count; index receipts by actor/time only if used by a real query. Snapshot captures an explicit closed article-field list (including edit_version), sorted IDs and contributor selections; do not use a future-column-blind `to_jsonb(row)` copy. Private tables have no app grants. Revoke PUBLIC/anon and grant authenticated EXECUTE only on the create signature.
- [x] Concurrency suite uses independent local psql processes/transactions over stdin: simultaneous same-actor request creates one draft/history set; a blocked call observes deactivated identity/profile/membership or taxonomy after the lock clears. Create `scripts/draft-concurrency/vitest.config.ts` with repository root, node environment and only its owned test; exclude that directory in root unit config. Set `test:draft-concurrency` to `vitest run --config scripts/draft-concurrency/vitest.config.ts`; add CI step after DB checks. No service-role client, passwords, hosted URL or new DB driver.
- [x] Apply incrementally, GREEN focused/shared/concurrency checks and preservation snapshot comparison. Use the commit sequence below, checking each step before committing.

Task 3 commit boundaries (owner requested small commits):

1. Record commit-size preference and refine this sequence (documentation only).
2. Add private receipt/quota storage and edit versions, with schema/grant/upgrade tests and generated types.
3. Add private actor/reference locking, quota and hashing guards with focused tests.
4. Add closed bounded revision snapshot construction with focused tests.
5. Add create transaction, actor/replay/grant tests and generated RPC types.
6. Add separate validation/quota and rollback regression suites as needed, each with at most 300 changed lines.
7. Add bounded real-session concurrency support, then focused races/CI wiring in separate commits.
8. Record final checks and documentation. Fix review defects in separate focused commits.

The public RPC is enabled only after its guards and snapshot helper exist. Each intermediate migration is additive and keeps prior clients compatible. Task 4 retains its `20261022020000` timestamp. Supplementary test filenames may use descriptive suffixes within the Task 3 number range; no copied large JSON fixtures.

Evidence: [Task 3 verification](../../testing.md#phase-3-task-3-draft-creation). Implementation is split into focused commits below 300 changed lines; save/editor remain pending.

### Task 4: versioned atomic draft save

**Files:** Create `supabase/migrations/20261022020000_save_article_draft.sql`, `supabase/tests/014_save_draft.test.sql`; extend existing concurrency suite; update types/API/data/security/testing docs.

**Interfaces:** `public.save_article_draft(p_article_id uuid,p_expected_version integer,p_request_id uuid,p_draft jsonb)->jsonb`; consumes all Task 2/3 helpers/records. Same result/error union and caller-derived actor. No new table write grants or history endpoint.

- [x] Write direct-call tests: owner A updates A; B/real credited B cannot update A; active admin may update A without reassignment; inactive/ineligible/inactive-profile callers fail. Wrong/missing/private IDs disclose no row; published/archived drafts cannot be edited. Unsupported legacy content returns `unsupported_content` with original stored content preserved. Invalid/stale/inactive associations and forged fields leave content/history unchanged.
- [x] Test current expected version changes once, stale expected version changes nothing, version exhaustion fails safely, exact normalized no-op returns unchanged version/time with receipt but no content history, and old successful replay does not overwrite later edits. Reusing a completed request with changed input/version/resource/operation gives `request_conflict`; pure category/tag/credit ordering normalization does not fabricate differences.
- [x] Observe RED; implement caller locking/replay/quota sequencing from Task 3, then target row lock and current authority/status/version checks. Replace links safely within the business subtransaction, update only allowlisted fields and version, capture full snapshot and one `article.updated` audit event. Failure at every stage restores the complete prior state. Return original receipt result on safe replay after current authorization checks.
- [x] Extend real-session races: simultaneous saves with one expected version yield one changed result and one conflict; identical requests yield one changed result plus replay; failed capture and late-retry cases remain atomic. Interleave owner/admin updates, revocation and taxonomy changes; bound test waits with timeouts and clean rollback/fixture cleanup, not arbitrary long sleeps.
- [x] Apply incrementally; GREEN focused/shared/concurrency checks and baseline preservation. Keep each commit under 300 changed lines: (1) versioned save RPC/basic tests/types, (2) authority/lifecycle/legacy denials, (3) no-op/replay/association/quota cases, (4) rollback faults, (5) independent-session save races and revocation, (6) final documentation and verification. All use the accepted save contract; no new write grant or product decision.

Evidence: [Task 4 verification](../../testing.md#phase-3-task-4-versioned-draft-save). No application query/action/form/editor implementation is included.

### Task 5: server query/action boundary

**Files:** Create `src/lib/articles/draft-queries/draft-queries.ts` and `.test.ts`, `draft-actions/draft-actions.ts` and `.test.ts`, `draft-cursor/draft-cursor.ts` and `.test.ts`. Modify `next.config.ts` only for accepted 4 MiB action transport; update API/testing docs.

**Interfaces:** `getMyArticlesPage(input:{cursor?:string;pageSize?:number}):Promise<ArticlePage>`; `getDraftDetail(articleId:string):Promise<DraftDetailResult>`; `getDraftOptions(sectionId?:string):Promise<DraftOptions>`; server actions `createDraftAction(command:CreateDraftCommand):Promise<DraftWriteResult>` and `saveDraftAction(command:SaveDraftCommand):Promise<DraftWriteResult>`. ArticlePage has bounded summaries plus nextCursor, no body. Detail result is editable `{articleId,version,updatedAt,draft,unavailableSelections}` or read-only `{status}`, unsupported-content state, or missing. Export these owned types from their modules; no barrel-only files.

- [x] RED unit tests independently call every boundary, checking verified active guard, no service-role client, exact RPC args, strict command fields, stable errors without raw SQL/body logs, replay preservation and private/no-store behavior. Reject invalid page size/cursor/UUID; profile ownership filter must apply even to administrators.
- [x] Implement default 20/max 50 page size and `(updated_at DESC,id DESC)` keyset cursor with a strict opaque version-one timestamp/UUID object preserving DB timestamp precision. Select listing summaries only; current caller profile always supplies the owner filter. Detail uses existing RLS, validates body before editor load and returns safe unsupported/read-only states. Catalog choices explicitly filter active section/category/profile rows even for admin; unavailable existing IDs get a generic label, not broader read grants.
- [x] Typed actions validate first, invoke user-scoped RPCs, parse the result union, revalidate only private draft/list surfaces and never accept ownership/actor/status/history fields. Treat transport uncertainty as `unavailable` so the same request UUID can be retried. No automatic new command after lost response. Configure/test near-limit transport without weakening canonical DB bounds.
- [x] GREEN focused/full unit, types/lint/format/build and SQL/contract regression. Committed as focused cursor/client/list/options/detail/schema/action/transport fixes plus documentation, each below 300 changed lines.

Task 5 execution details: keep commits under 300 changed lines; implement cursor, private fetch, listing, catalog options, detail, action schemas/actions and final evidence separately. Add focused `draft-options/` and `draft-action-contract/` modules when their owning implementation needs them, with colocated tests.

- `ArticlePage` contains `items` (id/title/slug/status/sectionId/version/updatedAt only) and nullable `nextCursor`. Invalid page inputs and query failures throw safe errors; access redirects from the existing guard propagate.
- `DraftDetailResult` uses `kind: "editable" | "readOnly" | "unsupportedContent" | "notFound"`. Editable data includes articleId/version/updatedAt, canonical draft and unavailable-selection IDs; read-only/unsupported states never return an unsafe body. Fetch article plus associations in one embedded SQL read to avoid mixing versions.
- `DraftOptions` contains active sections/categories, existing tags and active contributor profiles; category choices require an active matching parent. Unavailable current IDs are retained as IDs, with generic labels supplied by the form later.
- Queries use request-time rendering and user-scoped no-store fetches. Actions strictly validate the command, use the existing verified access lookup, call only one matching RPC with its original request ID, and validate the returned union. Known failures expose stable codes. Confirmed successful commits remain acknowledged if private-path revalidation fails; future dynamic reads fetch current data.
- Preserve DB timestamp precision in strict version-one cursors. The accepted transport limit is 4 MiB; canonical draft/body limits stay unchanged. Invalid action envelopes are rejected before RPC; database quota applies to every attempted RPC.

Task 5 completion: [verification evidence](../../testing.md#phase-3-task-5-server-queryaction-boundary). Separate review resolved the catalog row-cap issue; human security review and future draft route/form browser coverage remain outstanding. Owner review checkpoint before Task 6.

### Task 6: My Articles listing

**Files:** Modify `src/app/(dashboard)/dashboard/page.tsx` and its test; create route `loading.tsx`/`error.tsx` when needed and `src/components/dashboard/article-list/article-list.tsx`, `.module.css`, `.test.tsx`; create `e2e/drafts/drafts.spec.ts` and extend local-only fixture helper.

**Interfaces:** `ArticleList({page:ArticlePage}):React.JSX.Element`; server route consumes Task 5 own-list query and existing independent membership guards.

- [x] RED component/browser assertions for owned rows, empty/loading/error/next-page behavior and keyboard create/edit links. Admin's My Articles remains own-only; authored A/B content must not leak through list or cursor. Fixtures are synthetic and bound to the fixed local project.
- [x] Implement semantic list/table and paging links using shared primitives/tokens/CSS Modules. Draft rows link to edit; published/archived entries do not imply write capability. Errors expose retry UI without internals. No editor/provider/global store.
- [x] GREEN component/full unit/build, relevant SQL and desktop/mobile draft tests. Committed in focused list, route/recovery, browser and review-fix changes, each below 300 changed lines.

Task 6 completion: [evidence and review screenshots](../../testing.md#phase-3-task-6-my-articles-listing). Initial no-JS reads and error recovery render on the server; pagination pending feedback uses a small client link component instead of automatic loading.tsx. Create/edit destinations intentionally remain Tasks 7/8. Owner review checkpoint before Task 7.

### Task 7: new draft form

**Files:** Create `src/app/(dashboard)/dashboard/articles/new/page.tsx`, companion route test and `src/components/dashboard/draft-form/draft-form.tsx`, `.module.css`, `.test.tsx`; extend draft browser suite.

**Interfaces:** `DraftForm({initialDraft:DraftInput,options:DraftOptions,article?:{id:string;version:number;updatedAt:string}}):React.JSX.Element`; create mode initially uses NULL body/empty association arrays, all accepted metadata fields and explicit canonical slug. The same form supports edit mode in Task 8; Task 9 adds selectors.

- [x] RED tests for title/section/slug requirements, nullable optional metadata, global slug conflict, create/list navigation and uncertain retries with stable request ID. Failed/dirty forms retain inputs; keyboard labels/error summaries/status announcements are functional. Mutation server guards are tested independently of rendered controls.
- [x] Implement creation using accepted action, no publishing/upload buttons or silently renamed slug. Redirect successful creation to My Articles until Task 8 enables the edit route; add create-to-edit navigation there. Basic dirty/saving/error/retry behavior ships here; do not defer it until Task 10. Add synthetic dev/test catalog fixtures through local-only helpers, not real unresolved labels or hosted data.
- [x] GREEN unit/types/lint/format/build and desktop/mobile create journey. Committed as focused shared validation/controller/fields/form/route/review-fix/browser/evidence changes, each below 300 changed lines.

Task 7 completion: [verification and screenshots](../../testing.md#phase-3-task-7-new-draft-form). Basic form locks pending/uncertain values and keeps one request UUID through later access failures; only confirmed success resolves uncertainty. Task 10 still owns editable-in-flight state/reconciliation and stronger navigation warnings. Owner checkpoint before Task 8.

### Task 8: body editor and edit route

**Files:** Create detail route `src/app/(dashboard)/dashboard/articles/[id]/page.tsx` and companion test; `src/components/dashboard/draft-editor/` and `draft-toolbar/` implementation/CSS/tests; `src/lib/articles/draft-document/draft-document.ts` and `.test.ts`. Modify package/lockfile only for required matching Tiptap packages and update architecture/ADR/testing docs with actual installed versions.

**Interfaces:** `toEditorDocument(content:DraftDocument|null):EditorDocumentResult`; `fromEditorDocument(value:unknown):DraftDocumentResult`; `DraftEditor({value,onChange,onError,disabled}):React.JSX.Element`. The adapter owns canonical/native JSON translation; form/actions remain editor-agnostic. `EditorDocumentResult` is `{ok:true;document:JSONContent}|DraftFailure`, using Tiptap JSONContent only within the adapter/editor boundary. `DraftDocumentResult` is `{ok:true;document:DraftDocument}|DraftFailure`. Adapter failures use `unsupported_content` or `invalid_input`. Editor props are `value:DraftDocument|null`, `onChange:(value:DraftDocument)=>void`, `onError:(failure:DraftFailure)=>void`, `disabled:boolean`; no silently discarded data.

- [ ] Inspect current official package peers/license and test compatibility with pinned React/Next/Node in this branch before installation. Use only matching required `@tiptap/react`, `@tiptap/pm` and chosen extensions/StarterKit packages; do not install cloud/collaboration/Pro/UI kits. Run unfiltered production audit and compare full audit against the sole existing accepted dev finding; no new ignore. If incompatible/audit-blocked, report before changing the accepted editor.
- [ ] RED adapter/editor tests cover every native export/default attribute against the accepted canonical document, NULL/empty document, actual library round trips through DB parity, URL/paste attacks, unknown legacy versions/content and meaningful unsupported attributes. Tiptap defaults cannot silently enable excluded nodes/marks. Test hydration with client-only editor and `immediatelyRender:false` as official Next.js integration prescribes.
- [ ] Implement only paragraphs/H2-H3/quotes/lists/hard breaks/bold/italic/links, with controlled link-opening/rel behavior. Validate stored input before loading; block invalid/legacy body editing safely and preserve original rows. No raw HTML injection, media, tables/code/extensions outside grammar. Detail and form guards remain independent; read-only statuses never invoke save.
- [ ] GREEN adapter/component/full unit, production build and desktop/mobile edit/save/reopen plus DB parity. Commit `feat: edit private drafts with a constrained rich text editor`.

### Task 9: taxonomy and contributor selection

**Files:** Create colocated `src/components/dashboard/draft-taxonomy-fields/` and `draft-contributor-fields/` implementations/CSS/tests; integrate Task 7 form and Task 5 option queries; extend draft browser cases.

**Interfaces:** Controlled fields consume the corresponding DraftInput arrays and DraftOptions; changes emit the complete bounded selection value to the form, never a new tag/profile request.

- [ ] RED tests for active permitted IDs, 32/64/32 caps, explicit removal/reselection on section change, unavailable existing IDs, duplicate rejection, multiple contributor roles/order ties and guest profiles. Real credited B still cannot mutate A. Failed saves retain selections and return safe field feedback.
- [ ] Implement existing-ID selectors and deliberate same-section category confirmation; do not silently remove and save categories. Admins follow the same active-selection rule; no expanded catalog grants or management UI. Derive authority only in the existing action/RPC path.
- [ ] GREEN component/unit, SQL association/mutation regressions and desktop/mobile selector/save round trips. Commit `feat: select draft taxonomy and contributor credits`.

### Task 10: complete save/conflict/navigation interaction

**Files:** Extend owned draft form/editor controller and tests; create `src/lib/articles/draft-save-state/draft-save-state.ts` and `.test.ts` to isolate the shared transition logic; extend `e2e/drafts/` delayed/retry/conflict cases.

**Interfaces:** A saved submission records its request UUID, expected version and immutable submitted DraftInput; controller state separately retains latest edited input and last acknowledged committed version. Export `DraftSaveState`, `DraftSaveEvent` and `reduceDraftSave(state:DraftSaveState,event:DraftSaveEvent):DraftSaveState` from the owned module. State holds current/acknowledged input, committed article/version, pending immutable command and last result. Events are edit(input), submit(command), resolve(requestId,result), and reload(detail); reject mismatched response IDs and preserve edits newer than the submitted input. It does not persist private drafts in browser storage.

- [ ] RED tests: edit while save is pending; late response must not mark newer edits clean. Double click/lost successful response retries the same UUID/input; a deliberate changed command uses a new UUID. A stale tab retains local data and safely reloads/reconciles; it cannot force overwrite. Tests exercise transport interruption and concurrent browser contexts, not only action mocks.
- [ ] Finish explicit dirty/saving/saved/error/conflict states, accepted in-app and best-effort unload warnings, accessible status/error focus and recoverable reload behavior. No autosave timers, persistent backup, forced merge or crash-recovery promise.
- [ ] GREEN state/component/full unit, real mutation concurrency and desktop/mobile adversarial journeys. Commit `feat: preserve draft edits across retries and conflicts`.

### Task 11: integrated verification and handoff

**Files:** Existing relevant docs/tests/types only; store private upgrade/hosted evidence under this plan's ignored workspace. New migrations or unrelated cleanup require a demonstrated defect and focused fix, not polish.

- [ ] Before reset verify the pre-Task-2 populated baseline is preserved across all Phase 3 migrations and existing denials remain green; save evidence privately. Reproduce in a separate local environment if evidence is missing. Then clean-reset proof with empty content seeds and synthetic transaction/browser fixtures.
- [ ] Run focused SQL, all SQL, parity and independent-session concurrency suites; database lint/types drift; repository format/lint/types/unit/build; all desktop/mobile browser tests; production/full dependency audits with only the existing approved exception; secret scan and exact-head hosted CI. Record actual counts/failures; source-matching recent gates can be reused only when unchanged.
- [ ] Fresh whole-slice security/code review checks every review-focus path plus permissions/format/schema compatibility. Fix critical/important defects with observed RED/GREEN tests and a full relevant regression suite. Record optional deferred improvements and separately outstanding human/manual accessibility/session/hosted/recovery checks honestly.
- [ ] Document installed dependencies, implemented write/read boundaries, safe unsupported-content behavior, retry/quota/version/history semantics and deferred media/public/lifecycle/client decisions. Commit `docs: record private draft workflow verification` and stop for owner review before the next product slice.

## Dependency and pre-flight checks

Task 2 types/helpers/fixtures feed Tasks 3–5/8. Task 3 identity/quota/receipt/snapshot infrastructure feeds Task 4; no same helper is independently reimplemented. Tasks 3/4 feed typed Task 5 actions; Task 5 feeds Tasks 6–10. Task 7's single form/controller is reused by edit/selector/save tasks, not duplicated for each route. Task 11 covers every enabled boundary and preserves the old access model. Execute in order and append observed evidence to the plan ledger as tasks complete.
