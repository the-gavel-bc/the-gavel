# Testing and validation

Status: Foundation and Phase 2 content/history database coverage implemented; broader MVP coverage remains planned.

## Commands

Run commands with Node.js 22 and the pnpm version recorded in `package.json`.

| Check            | Command             | Current scope                                                                                                     |
| ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Formatting       | `pnpm format:check` | Repository source and documentation                                                                               |
| Lint             | `pnpm lint`         | Next.js and TypeScript source                                                                                     |
| Types            | `pnpm typecheck`    | Strict TypeScript compilation                                                                                     |
| Unit/component   | `pnpm test`         | Vitest and Testing Library                                                                                        |
| Browser          | `pnpm test:e2e`     | Playwright desktop and mobile projects                                                                            |
| Production build | `pnpm build`        | Next.js production compilation                                                                                    |
| Database         | `pnpm test:db`      | Local Supabase identity/content/history constraints and RLS, plus draft validation/create/save (1,075 assertions) |

Install the Playwright Chromium runtime once with `pnpm exec playwright install chromium`. Start local Supabase with `pnpm supabase start` using a Docker-compatible runtime. Run `pnpm supabase db reset`, `pnpm test:db`, `pnpm supabase db lint`, and `pnpm db:types:check`. Regenerate formatted types with `pnpm --silent db:types > src/lib/supabase/database/database.types.ts`. The drift check compares without overwriting the committed file.

## Implemented foundation coverage

- Unit/component tests cover configuration validation/startup, shell semantics, active membership checks, private profile resolution, safe OAuth redirects, and independent dashboard layout/page guards.
- pgTAP covers grants, RLS, profile ownership, inactive-member edit denial, membership read/write/delete denials, administrator approval, scoped profile lookup, and direct-operation denials for non-Google, unconfirmed, and out-of-domain identities.
- Playwright covers desktop/mobile homepage landmarks, keyboard focus/contrast and overflow; signed-out, inactive, unapproved Google, non-`bc.edu`, author, administrator, and forged-cookie access paths. Access tests run with JavaScript disabled.
- Browser fixtures are isolated to the fixed local Docker project. They set synthetic Auth metadata only; passwords and hosted Google credentials are not used. `db reset` restores the original passwordless fixtures.

## Implemented taxonomy coverage

`supabase/tests/004_content_taxonomy.test.sql` adds 163 transaction-local assertions for taxonomy bounds (1/120 accepted, 121 rejected), whitespace and canonical-slug rejection, case-insensitive names and scoped slug uniqueness, required/restrictive parent references, defaults, and updated-at behavior. Catalog tests check exact visible IDs, including an active category under an inactive parent. Anonymous, inactive, two-author, and administrator identities exercise reads and all insert/update/delete denials. Non-Google, unconfirmed, out-of-domain, and deactivated administrators cannot expand catalog visibility.

The additive Task 2 migration was applied to the populated foundation database without resetting it. A private local snapshot confirmed existing profiles, memberships, and synthetic Auth identity fields were unchanged after the tests. The focused taxonomy suite, all 209 database assertions, database lint, and generated-type drift check passed. These statements cover Task 2; they do not claim Phase 2's later article/association/history or clean-reset proof is complete.

Phase 2 migrations were applied incrementally with `pnpm supabase migration up --local`, preserving the ignored baseline snapshot. Task 7 verified upgrade preservation before performing the separate clean-reset proof. The normal reset workflow above is now appropriate for local synthetic data; never use it against hosted or production data.

## Implemented private article coverage

`supabase/tests/005_article_access.test.sql` adds 168 transaction-local assertions for required/optional text bounds and whitespace, canonical unique slugs, SQL NULL versus invalid JSON shapes, and exact serialized 1 MiB acceptance/one-byte-over rejection with ASCII and multibyte bodies. All twelve status/timestamp combinations are checked, plus defaults, restrictive owner/section references, and updated-at behavior.

Direct SQL tests prove cross-owner read denial, owner access without credits, administrator reads, anonymous grant denial (including published fixtures), inactive/ineligible identity denial, private Auth linkage protection, and all-role insert/body/owner/lifecycle/delete denial. The private predicate rejects missing/unreadable IDs and rechecks identity and current membership. These are stored-state/read-boundary tests, not workflow or publication-readiness tests.

Task 3 was applied incrementally without a reset. The original foundation snapshot remained unchanged. The focused article suite and full 377-assertion database suite passed; database lint found no schema errors. At Task 3, association/history and the Task 7 clean-reset proof remained pending; category association coverage is recorded below.

## Implemented article/category coverage

`supabase/tests/006_article_categories.test.sql` adds 59 assertions for valid same-section many-to-many links, duplicate/missing/null references, mismatches from either parent, direct link changes, restricted parent section/identity changes, and referenced deletion. Privileged subtransactions demonstrate valid remove/change/reattach operations and restoration of original parents and links after a failed final insert, from both parent directions. All fixtures roll back with the test's outer transaction.

Exact-ID reads cover owner A, owner B with untrusted credit/owner-looking metadata, and administrator access. Anonymous, inactive, non-Google, unconfirmed, out-of-domain, and deactivated administrator paths are denied. Every application role is denied link insert/update/delete. Actual contributor-credit storage and its denial tests are recorded below.

Task 4 applied incrementally without a reset; the original foundation snapshot was unchanged. The focused suite and all 436 database assertions passed, and database lint found no schema errors. At Task 4, tag/credit links, history, and final clean-reset proof remained pending; tag/credit coverage is recorded below.

## Implemented tag and contributor coverage

`supabase/tests/007_article_tags_contributors.test.sql` adds 90 assertions for duplicate/required/missing references, restrictive deletion and identity changes, supported credit roles, default/non-negative order, ties, multiple roles per profile/article, and guest contributors without Auth links. Separate tag-only and credit-only article fixtures ensure other foreign keys cannot mask missing article reference restrictions.

Author B receives actual writer/editor credits on Author A's private article but can still read only B's own article and associations. Exact-ID checks cover articles, categories, tags, and credits; A retains owner reads without any credit. Administrator, anonymous, inactive, ineligible, and deactivated administrator paths plus all-role insert/update/delete denials exercise both new tables.

Task 5 applied incrementally without a reset. The original foundation snapshot remained unchanged. The focused suite and full 526-assertion database suite passed; database lint found no schema errors. At Task 5, history and the final upgrade/clean-reset proof remained pending; history coverage is recorded below. No application mutation, content renderer, or tag-entry normalization is established by these tests.

## Implemented history coverage

`supabase/tests/008_content_history.test.sql` adds 122 assertions for revision version/object/required fields and exact serialized 2 MiB acceptance/one-byte-over rejection with ASCII and multibyte snapshots. Isolated actors and a revision-only article prevent unrelated foundation/association foreign keys from masking restrictive history references. Audit tests cover all seven accepted actions, rejected action/resource types, nullable UUID correlation, retained resource IDs without an article, required fields, defaults, and the exact closed metadata column set.

Crossed revision actors plus real contributor credits prove that history reads depend on article ownership, not actor/credit identity. Exact owner/admin reads, ordinary-owner audit denial, anonymous/inactive/ineligible/deactivated administrator denials, and all-role insert/payload/actor/delete denials exercise both tables. Privileged fixtures do not establish an application actor-forging or capture interface.

Task 6 applied incrementally without resetting. The original foundation snapshot remained unchanged. The focused suite and full 648-assertion database suite passed; database lint found no schema errors. Final integrated upgrade/clean-reset proof remains Task 7. Automatic capture, restore, rich snapshot validation, and retention/deletion workflows are not implemented or claimed tested.

## Phase 2 integrated verification

Local verification completed on 2026-10-21 against the complete content schema integrated at `aaa4226`. Before any reset, the original pre-Task-2 snapshot matched exactly: four profiles, four memberships, and five synthetic Auth identities. Migration history contained the three foundation migrations followed by all five Phase 2 migrations applied in order; the full 648-assertion denial/constraint suite passed. Private row snapshots and execution evidence remain in the ignored plan workspace and are not committed.

A separate `pnpm supabase db reset` then applied all eight migrations and the original synthetic seed. All nine content tables were empty as intended; tests supply transaction-local content instead of deciding real publication labels. The reset intentionally restores the original four seeded identities; browser fixtures may add/adjust their fixed local synthetic identities afterward. This does not invalidate the already-recorded pre-reset upgrade proof.

| Gate                                   | Observed local result                    |
| -------------------------------------- | ---------------------------------------- |
| Upgrade SQL suite before reset         | 648 assertions passed                    |
| Clean-install SQL suite after reset    | 648 assertions passed                    |
| Database lint and generated-type drift | Passed; no schema errors or type changes |
| Formatting, lint, strict TypeScript    | Passed                                   |
| Unit/component tests                   | 44 passed                                |
| Production build                       | Passed                                   |
| Desktop/mobile Playwright              | 16 passed                                |

Fresh whole-phase code/security review of `74ae26a..aaa4226` found no Critical, Important, or Minor findings. It inspected implementation and upgrade evidence; it did not independently rerun these local gates. [Hosted run 39693495994](https://github.com/dylandrozario/the-gavel/actions/runs/39693495994) passed all gates on task-branch commit `6ce8938`, including secret scanning, database reset/denials/type drift, build/browser checks, the unfiltered production audit, and the full audit with the existing exception. This completion update changes documentation only; completion-head status remains visible in [PR #14](https://github.com/dylandrozario/the-gavel/pull/14), opened after PR #13 merged before these final status notes were pushed. The approved dependency exception is unchanged; no new ignore or dependency change was introduced.

Phase 2 supplies data storage and read permissions, with all new application mutations closed. Editor-node validation/safe rendering, uploads, public article projections, lifecycle/reassignment/slug redirects, and atomic content/history capture remain future work. Unicode tag-entry normalization, real taxonomy/navigation decisions, retention, and identity-deletion semantics remain unresolved where documented. Representative query performance requires the later content queries and load evidence. Optional catalog-attribute assertions for the existing private helper remain deferred; its stable/security-definer/empty-search-path attributes were inspected and behavior tests cover grants and recursion.

No hosted Supabase/OAuth setup is needed to review this data-only phase. Independent human maintainer review remains outstanding under the existing Git workflow. Pre-launch session adapter/refresh/logout coverage and real Google HTTPS smoke tests remain listed below; hosted service ownership/setup, accessibility review of later UI, and operational recovery verification remain in [deployment](deployment.md) and the [runbooks](runbooks/README.md).

## Session coverage still needed before hosted launch

The browser access tests inject fresh synthetic sessions and set cookie flags in their fixtures. Callback unit tests mock the Supabase client. These tests establish access decisions, but do not prove real OAuth/PKCE session issuance or refresh/logout behavior.

- [ ] Test the server cookie adapter using SDK-emitted cookie writes: preserve all cookie chunks and options, assert HttpOnly/SameSite=Lax and Secure for HTTPS, and cover writable versus read-only server contexts.
- [ ] Test the proxy with an expired access token and valid refresh session: propagate refreshed cookies to both the downstream request and outgoing response, retain private/no-store headers, and deny invalid sessions.
- [ ] Test sign-out through the server action: clear the local session, deny subsequent dashboard access, and handle failures without leaking session details.
- [ ] After staging Supabase/Google OAuth is configured, exercise real Google sign-in, PKCE callback, refresh, sign-out, and denied identities using test accounts. Verify emitted cookie flags and redirect destinations on HTTPS. Follow [deployment setup](deployment.md#google-provider-setup-manual-not-verified-on-hosted-services).

These are unimplemented coverage tasks, not confirmed runtime defects or claims of completed testing. Adapter/action tests can be automated without a human login; the real Google smoke test requires manual provider setup. They remain pre-launch work and do not prevent Phase 2 planning. Human foundation review is tracked separately in the [maintainer checklist](reviews/phase-1-foundation.md#maintainer-review-steps).

## CI and security gates

`.github/workflows/ci.yml` installs the frozen lockfile and runs the local gates, generated-type drift check, dependency audit, and Gitleaks v8.30.1 history scan. It needs no production secrets. Hosted CI passed for merged foundation commit `66f2f82`; see the [review evidence](reviews/phase-1-foundation.md#review-evidence). This verifies that commit, not future changes.

The former CI exception for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) was retired on 2026-10-23 after upstream withdrew the advisory and unfiltered production/full audits reported zero findings. CI now runs `pnpm audit --prod --audit-level=high` and `pnpm audit --audit-level=high` without any ignore. All high/critical findings remain blocking. [ADR 0005](decisions/0005-temporary-ci-audit-exception.md) retains the historical approval and retirement evidence.

## Required broader MVP coverage

### Critical journeys

- Public reader opens homepage, archives, article, author, search, About, letters, and submission instructions.
- Approved author signs in, creates an article, saves a draft, publishes, edits, and archives it.
- Administrator approves/deactivates members, manages content/taxonomy/homepage settings, restores archives, and permanently deletes with confirmation.
- Unapproved and non-`bc.edu` users are denied dashboard access.

### Authorization

Test anonymous, inactive, author A, author B, and administrator identities against every sensitive operation. Include direct database/API attempts, not only hidden buttons. Prove authors cannot access or mutate another owner's private content, roles, audit records, or administrator settings.

### Content and uploads

- Malicious rich-text and URL payloads remain inert or are rejected.
- Disallowed HTML, scripts, iframes, protocols, and files are rejected.
- Valid images respect size/type/dimension limits and ownership.
- Category/section mismatches and duplicate normalized tags fail safely.

### Public behavior

- Draft and archived records never appear in public data, caches, search, metadata, sitemaps, feeds, or related content.
- Search and all archive types paginate correctly.
- Featured selections use configured items and deterministic fallbacks.
- Slug redirects, metadata, and not-found behavior work.
- Related articles use recent published content from the same section.

### Quality and operations

- Keyboard, focus, semantic, screen-reader, contrast, zoom, reduced-motion, and responsive checks target WCAG 2.2 AA.
- Security headers and cache behavior are verified against deployed previews.
- Dependency and secret scans run in CI.
- Migrations are tested from clean and previous schemas.
- Backup restoration is exercised in a non-production environment before launch.

## Test environment

- Use isolated local/test Supabase data and synthetic identities.
- Never use production secrets or copy private production records into tests.
- Reset deterministic fixtures between tests.
- Protect preview deployments and connect them only to staging services.

## Completion evidence

Every change reports the exact checks run, results, and limitations. No check is called passing unless it completed successfully.

## Phase 3 Task 2: draft validation

`pnpm test:draft-contract` runs the isolated Node Vitest configuration in `scripts/draft-contract-check/`. Start the fixed local Docker Supabase project and apply pending migrations with `pnpm supabase migration up --local` first. This command never resets the DB. It passes shared literal/generated synthetic fixtures through TypeScript and private PostgreSQL functions in a rollback transaction, comparing outcomes, canonical results and serialized UTF-8 sizes. Fixture JSON is hex-encoded over psql stdin with no shell interpolation or hosted credentials. CI runs this additional gate after the existing DB checks. Default `pnpm test` excludes this Docker-dependent suite.

Task 2 verification: 265 unit/component tests (221 draft cases plus the existing 44), 216 parity assertions and 683 pgTAP assertions (35 new plus the existing 648) passed. Cases cover every enabled node/mark, invalid parent/type/attribute combinations, unsafe URLs/hosts/ports, ASCII/multibyte/escaped exact 1 MiB bodies, node/depth/link/selection/scalar bounds, duplicate/forged fields, canonical IDs/credits and helper privilege denials. The byte helper accepts exactly 1,100,000 serialized bytes and rejects one more. The strict draft grammar's combined field caps keep valid requests below that larger transport guard; no valid exact-cap request is fabricated using unknown padding fields.

The additive validation migration was applied without a reset. Private before/after row fingerprints cover all existing public content/identity tables and synthetic Auth users/identities. Database lint, strict types, lint and generated-type drift checks passed. This establishes input validation only; caller/reference locks, quotas, atomic history, idempotent mutations, editor/adapter integration and browser journeys remain assigned to Tasks 3–11.

Compatibility: existing readers, writers and stored bodies are unchanged. New helpers have no application execution grants or consumers until the mutation tasks. If a later deployment must roll back application code, leave the additive helpers in place; no data rewrite or destructive migration is needed. Changes to these helpers after release use a new migration, preserving applied history. Keep the populated upgrade evidence through Tasks 3–4 and prove preservation before the separate clean-install reset in Task 11.

Independent review found a malformed-punycode SQL/browser mismatch and no other reported defects. The owner explicitly deferred internationalized domains. New regression cases were observed failing before the fix; both validators now reject all case-insensitive `xn--` host labels while ordinary ASCII domains and international text in URL paths remain accepted. The final suites above pass with the review fix. Production build and before/after row-fingerprint comparison passed; no reset was performed. Browser behavior is unchanged by this task; no editor, mutation action or new route is enabled.

## Phase 3 Task 3: draft creation

Task 3 was implemented in focused commits targeting at most 300 changed lines each. `pnpm test:db` passes 926 assertions across 18 suites; the new 243 assertions cover private write-state grants/defaults, caller/reference guards, numeric normalization, snapshots, authenticated creates/replays, all eligibility denials, quota/window/slug/request conflicts, complete selections and six injected failure stages. Existing direct-table role/ownership denials remain green.

`pnpm test:draft-concurrency` runs independent psql sessions against the fixed local Docker project. All 10 tests pass: session independence, fixture cleanup, duplicate creates with one committed history set plus replay, quota competition, and blocked calls observing committed identity/membership/owner-profile/section/category/credited-profile deactivation. Barriers inspect real PostgreSQL lock waits before releasing the competing transaction; statement/lock/process timeouts bound execution. Reserved synthetic fixture IDs are refused if already present; successful runs delete only their owned rows. Run this suite sequentially with pgTAP because its short-lived fixtures are committed for cross-session visibility. CI runs it after DB/contract gates; default unit tests exclude it.

The pre-Task-2 private fingerprints still match after all Task 3 migrations/tests, with no reset. A transaction-local pre-migration article fixture additionally proved that adding edit_version supplies 1 without changing existing fields. Types were regenerated; full database lint, type drift and repository checks are recorded in the task ledger/PR. New tables remain empty outside test transactions after fixture cleanup. Clean-install proof runs in hosted CI; the local reset stays deferred until Task 11 preserves all upgrade evidence.

Independent read-only review found no blocking production SQL defects. Review of the new race harness required the dedicated CI step, now added; a trailing EOF whitespace finding was removed. Human security/migration review remains outstanding. No UI changed, so new draft browser journeys belong to the later form/editor tasks. No new dependency or audit exception is introduced. Roll back application consumers without dropping the additive schema; if disabling the RPC is required, revoke its execution in a new forward migration. Do not restore broad direct writes or destructively remove quota/receipt/history data.

## Phase 3 Task 4: versioned draft save

`pnpm test:db` passes 1,075 assertions across 25 suites (149 new save assertions; all prior 926 still pass). Focused 014 suites cover the authenticated owner/admin boundary, real credit non-authority, all eligibility denials, wrong/missing resources, wrong statuses and unsupported legacy preservation, stale/exhausted versions, strict arguments/protected fields, no-op time/version/history preservation, canonical selections, request/resource/version/operation conflicts, quota/replay rules and complete section/category replacement. Ten injected update/delete/insert/revision/audit/receipt failures restore every original field/link/time/version and existing history/receipt. No-op receipt failure and recovery are also tested.

The independent-session suite now passes 25 tests. New cases exercise competing save requests, identical-request replay, both owner/admin winning directions, an old replay after a newer save, and nine real waits involving caller identity/membership/profile, selected section/category/profile, article status/version and stored legacy format. These use the existing bounded local-only harness and CI gate; a separately reserved synthetic administrator avoids modifying seeded administrator metadata. Fixture cleanup and original-row fingerprints are verified. Run pgTAP and concurrency sequentially because cross-session fixtures are briefly committed.

The additive save migration changes no existing table/row or policy. Local upgrade evidence remains intact without a reset; clean-install/browser/security gates run in hosted CI. Unit/contract parity, database lint/type drift and repository build/type/lint/format checks are recorded with actual results in the task ledger/PR. No new UI or browser journey is claimed; queries/actions/forms/editor remain Tasks 5–10.

Independent read-only review found no blocking save SQL or new concurrency findings. A stale API planning sentence was corrected in the final documentation pass. Human security review remains separate. Roll back application consumers while retaining the additive state/history; if the save RPC must be disabled, revoke its signature in a new forward migration. No dependency/audit exception changed, and internationalized domains remain explicitly deferred.

## Phase 3 Task 5: server query/action boundary

The full unit/component suite passes 347 tests (82 new boundary cases). Tests independently call the list, detail and options queries and both actions through the real Supabase SDK with mocked HTTP. They assert ownership filters including administrators, default/max page bounds, strict cursors with microsecond preservation, membership redirects, embedded detail associations, safe read-only/unsupported/missing states, active catalogs/parents, unavailable IDs, exact RPC arguments, verified-access denials, strict command/result fields, replay/no-op receipts and private-path-only revalidation. A 1,501-choice regression and a selected tag after row 1,000 prevent catalog truncation at the configured API row cap. The server-client test proves use of the publishable key and an explicit no-store override. The pinned Next Flight encoder verifies valid near-1-MiB ASCII, multibyte and escaped bodies fit the configured 4 MiB transport without changing canonical database bounds.

Fresh local checks passed: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test:db` (1,075 assertions), `pnpm test:draft-contract` (216), `pnpm test:draft-concurrency` (25), `pnpm supabase db lint`, `pnpm db:types:check`, and `pnpm test:e2e` (16 existing desktop/mobile access cases). A live local authenticated PostgREST smoke check accepted the exact detail/category embedded-select syntax; the anonymous private-article probe was denied by grants. This smoke check does not replace the existing SQL role/ownership denial suite or future route integration tests.

The original pre-Task-2 row fingerprints matched after Task 5 database checks without a reset. Running browser setup subsequently refreshed only the existing synthetic `auth.users` metadata, including timestamp fields; every public-table and `auth.identities` fingerprint still matched. Both private snapshots are retained, distinguishing expected test setup from migration preservation evidence.

Independent review found one catalog truncation issue; its failing regression was fixed with 500-row ordered pages and the reviewer confirmed resolution. No remaining blocking finding was reported. No schema, grant, dependency, audit exception or UI changed. Human security review remains outstanding. Actual Next action registration/dispatch, malformed-wire requests and draft browser journeys remain required when routes/forms consume these boundaries in Tasks 6–10; existing browser tests establish only the current access flows. The final integration task must retain those checks. No hosted provider setup or manual CLI/Docker installation is needed for this task in the already-running local environment.

## Phase 3 Task 6: My Articles listing

The full unit/component suite passes 356 tests. New coverage exercises empty/status/draft-only links, escaped titles, keyboard order, query cursor routing, repeated cursor rejection, safe server/client error presentation, retry/newest links, pending navigation feedback and preserved auth redirects. Typecheck, lint, formatting and production build pass; the unchanged 1,075 SQL assertions also pass. No migration or dependency changed.

All 26 desktop/mobile browser tests pass (10 new cases). Isolated fixture identities exercise 21 owned rows with identical microsecond timestamps, both pagination directions through next/newest links, published/archived rows without edit controls, author/admin isolation with a different owner's cursor, keyboard create/edit focus, no-store headers and no horizontal overflow. A blocked RSC navigation proves client loading feedback. Without JavaScript, invalid cursor recovery and a real checked-read failure both render safe HTML; removing only the synthetic unsupported-timestamp row makes the native Try again link succeed. The latter tests defensive response validation, not an actual network outage.

Initial browser failures identified missing archived fixture timestamps, a shared fixture name and streamed loading/error fallbacks that depend on JavaScript. The fixture issues were corrected without weakening constraints. Initial reads now wait for data; client pagination uses `useLinkStatus` and read failures render shared safe server recovery. Unexpected client failures retain the route error boundary. Independent review found an edit-link label mismatch; the failing accessible-name regression was corrected to include the visible words “Edit draft,” then the full unit/browser suites passed.

Browser setup refuses occupied reserved IDs, uses one transaction per setup/cleanup and separates desktop/mobile identities and content. Cleanup removes only installed fixture rows. Original public-table and identity fingerprints remain unchanged; the foundation browser setup still intentionally refreshes its fixed synthetic auth.users metadata. No reset was performed.

Review the [desktop screenshot](reviews/assets/phase-3-task6-desktop.png) and [mobile screenshot](reviews/assets/phase-3-task6-mobile.png) for visual hierarchy, spacing and visible focus. Automated keyboard checks and visual inspection passed; human screen-reader and the separate security review remain outstanding. At Task 6 completion, create/edit destinations remained Tasks 7/8; creation is implemented below, while edit remains Task 8. No new manual Supabase, CLI or Docker setup is needed in the already-running local environment.

## Phase 3 Task 7: new-draft form

The full unit/component suite passes 378 tests. New cases cover shared required/optional metadata validation and Unicode bounds, labels/error associations/focus, nullable fields, empty active catalogs, canonical slug/global collision handling, confirmed create navigation, duplicate submit blocking, basic dirty/unload warning state and exact uncertain retries. A review regression proves `unavailable → forbidden → replay success` retains one UUID/payload; access failure cannot resolve an earlier unknown commit. Confirmed creates lock controls during list navigation. Typecheck, lint, format, production build, 1,075 SQL assertions, 216 TypeScript/SQL parity checks, database lint and generated-type drift checks pass.

All 38 desktop/mobile browser cases pass, including 12 create-route cases. They cover keyboard creation with required-field feedback, owned-list navigation, NULL body/optionals, populated optional metadata, global collision without renaming/input loss, direct signed-out denial and disabled/explained no-JavaScript behavior. Real Next action requests reject malformed encoding and forged ownership without new rows. In the lost-response test the server commits, the browser loses the response, access is revoked for a retry, then restored; all three requests have identical bodies and the DB contains exactly one version-one draft, revision, audit and receipt. Expected malformed-wire cases produce a bounded server decode error; no SQL/body diagnostic is returned by application handlers. Near-limit Flight capacity remains covered by Task 5 encoder tests; rich-body route round trips belong to Task 8.

Fixture suites use disjoint reserved identities/sections, refuse occupied IDs and clean up only their installed synthetic actors' generated content/history/receipts/quotas. No production or real client taxonomy is seeded. Public-table/auth.identities fingerprints still match the original baseline after cleanup; only foundation setup's existing synthetic auth.users timestamps/metadata change intentionally. No reset was used.

Independent review found the access-denial-after-uncertainty gap; its failing regression was fixed and the full unit/browser gates passed. Regression tests also reproduce and verify fixes for delayed native echoes overwriting newer text and immediate saves capturing stale input; browser checks assert exact paragraph order before save and after reload. No deferred review findings remain. Earlier lint/type checks exposed React readiness/ref-render and metadata-narrowing issues; corrected without rule exceptions or changed accepted validation outcomes. A collision browser assertion was scoped away from Next's separate route announcer. Review the [desktop form](reviews/assets/phase-3-task7-desktop.png) and [mobile form](reviews/assets/phase-3-task7-mobile.png).

No manual CLI/Docker installation or hosted project is needed for this task. Real content still needs confirmed active taxonomy and the existing hosted sign-in setup. Human security/screen-reader review remains outstanding. Body/editor/edit route, association selectors and advanced in-flight/conflict/navigation behavior remain Tasks 8–10. Fields currently lock during pending/uncertain submissions; no autosave or persistent draft backup is implemented.

## Phase 3 Task 8: constrained body editor

Fresh checks pass: 413 unit/component tests, 1,075 SQL assertions, 216 canonical TypeScript/SQL parity tests, eight new actual-engine→canonical→PostgreSQL cases, typecheck, lint, formatting, database lint/type drift, production build and unfiltered production/full dependency audits (zero findings). All 13 direct Tiptap packages are 3.32.0/MIT, with no new editor peer mismatch. `pnpm peers check` still reports the pre-existing Vitest 5 requirement for newer Node typings while this repository has `@types/node` 20; Node runtime 22, typecheck and tests pass. That unrelated development-typing warning is unchanged.

`pnpm test:draft-editor` runs the isolated jsdom/native-engine configuration in `scripts/draft-editor-check/`, excluded from default unit tests and added to CI after the canonical parity gate. It tests NULL/empty and every supported format plus near-1-MiB ASCII, multibyte and escaped bodies, and dense linked content whose fixed native attributes exceed the normal request byte budget. Actual native exports translate and pass the real database validator; SQL bytes match the shared byte counter. Docker targets only the fixed local project; queries roll back and body/SQL diagnostics are not printed.

All 50 desktop/mobile browser cases pass with the normal two workers and original timeouts (43.3 seconds on the final production build). New journeys cover formatting/link save/reopen, sequential expected-version saves, author B denial and administrator edit, metadata-only body preservation, read-only/legacy/unavailable-reference preservation, unapproved identities, blocked HTML with no tracking fetch, prospective oversized-newline rejection, accessible body errors/basic unload guard and successful plain-text recovery. A real server action accepts/stores an exactly 1 MiB canonical body whose wire payload exceeds Next's former default limit. Existing create journeys now verify create→edit→list navigation and keyboard traversal through the toolbar. Independent review found the dense-native-overhead budget bug; the failing actual-engine regression, database parity and full gates verify its fix. Invalid native input also gained the missing basic unload protection and body error association. Regression tests also reproduce and verify fixes for delayed native echoes overwriting newer text and immediate saves capturing stale input; browser checks assert exact paragraph order before save and after reload. No deferred review findings remain.

One full run timed out across new and unchanged flows on the busy local host. Database inspection found no lock waits; repeated `supabase status` lookups measured 1.1–1.6 seconds each. The local helper now caches immutable already-validated localhost metadata per worker; fixed Docker targets, reserved IDs, role checks and cleanup remain unchanged. Serial verification passed all 50 cases, then default parallel verification passed all 50 without changing assertions or timeouts. The cache is test-only and lasts one worker process; restart the test run if local services/configuration change.

Review the [desktop editor](reviews/assets/phase-3-task8-desktop.png) and [mobile editor](reviews/assets/phase-3-task8-mobile.png). Original public-table/auth.identities fingerprints match after actor-scoped fixture/history/receipt/quota cleanup; only the known foundation synthetic auth.users metadata changes. No reset/migration was used. The lazy editor entry measured 377,675 raw/119,121 gzip JS bytes and 4,915 raw/1,461 gzip CSS bytes, excluding shared framework chunks.

Human rich-content/security and screen-reader review remain outstanding. Only plain-text clipboard payloads are supported; other formats are explicitly blocked. Unavailable selections currently prevent editing until Task 9 supplies deliberate replacement/removal. Editable-in-flight/reconciliation and stronger SPA navigation warnings remain Task 10. No new manual tool installation, hosted project or real taxonomy decision was required. Real content still needs the existing active taxonomy/provider setup. Revert application/editor consumers to roll back; retain version-one canonical records and existing SQL controls, never broaden direct writes or destructively remove content/history.

## Phase 3 Task 9: draft association selection

Task 9 adds existing category/tag selectors and contributor profile/role/order fields to both create and edit. Unavailable selections remain visible until deliberate removal/replacement; section changes never silently clear categories. The guarded category-read action loads only active matching categories/parents, paginates and uses the existing no-store client. Stale responses cannot replace current choices. Pending/uncertain writes keep the existing exact-command lock/retry behavior.

Fresh checks on Node 22.20.0 and pnpm 11.25.0:

- `pnpm test`: 431 unit/component tests pass, including selection bounds, duplicate/missing/wrong-section IDs, guest/multiple-role/tied-order credits, stale category responses/retry, retained input and empty-active-section repair. Focused tests were run with `pnpm exec vitest run <paths>`; this pnpm version did not forward `pnpm test -- <paths>` as a filter.
- `pnpm test:db`: all 1,075 SQL assertions pass, retaining role/ownership, association, active-reference and mutation denials.
- `pnpm test:draft-contract`: all 216 canonical TypeScript/PostgreSQL parity tests pass. `pnpm db:types:check` matches; `pnpm supabase db lint` reports no schema errors.
- `pnpm exec playwright test`: all 60 desktop/mobile cases pass with the original two workers and timeouts (58.2 seconds including configured production build/start). Ten new journeys cover create/save/reopen, guest/tied-role credits, deliberate section/category repair, author/admin post-load deactivation rejection with retained input, and credited non-owner denial. Keyboard checkbox interaction, focus traversal and mobile overflow checks pass. The existing keyboard journey now bounds traversal by actual form controls rather than assuming a fixed 20 Tab presses.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `git diff --check`, and unfiltered `pnpm audit --prod --audit-level=high` / `pnpm audit --audit-level=high` pass; both audits report no known vulnerabilities. Locked installation succeeded with `pnpm install --frozen-lockfile` after the offline store lacked a tarball.

Fresh independent agent review found one Important issue: an empty active-section catalog disabled the entire repair form. An observed failing regression now proves metadata/removal controls remain usable while Save stays blocked. The full unit/browser suites pass after this fix. A separate observed regression corrected false unsaved warnings after canonical association sorting: successful locked saves acknowledge the canonical submitted input as well as its baseline. No unresolved agent-review findings remain; this does not substitute for human review.

Inspect the [desktop selectors](reviews/assets/phase-3-task9-desktop.png) and [mobile selectors](reviews/assets/phase-3-task9-mobile.png). Images were visually inspected for responsive layout and readable native controls. Fixture setup uses reserved synthetic IDs, rejects collisions and cleans owned association rows before parent rows. No reset or migration was run. Before/after fingerprints cover public tables, private draft receipt/quota tables and auth.identities; only the established foundation auth.users test metadata is excluded. Private evidence remains in this task's ignored workspace for later integrated verification.

No new dependency, schema, grant, public projection, auth model or lifecycle capability is introduced. Hosted CI has not been run for this branch. Human security/screen-reader review and real hosted/provider/taxonomy setup remain outstanding. Task 10 still owns editable-in-flight/conflict/navigation reconciliation; Task 11 owns the whole-slice upgrade/clean-install/handoff proof.

## Phase 3 Task 10: save and conflict recovery

Task 10 keeps current input, acknowledged input, committed resource/version and immutable pending commands separate. Newer metadata, body and associations stay editable and unsaved after a late receipt. Retry original save retains its exact UUID/payload/version across newer input and access revocation; a deliberate new save waits for resolution. Create success with newer input retains the created identity on the mounted form, avoiding duplicate creates or premature navigation.

Conflict review reads the latest authorized snapshot/options without replacing input. Explicit confirmation adopts an editable non-stale version and refreshes catalogs/editor state, focuses Title, and retains former local metadata/selections and the last valid canonical body as an in-memory reference for manual re-entry. Unsupported native body edits are explicitly excluded from that reference. Hidden/read-only/unsupported reads preserve current input and cannot enable editable reload or force overwrite.

Fresh checks on Node 22.20.0 / pnpm 11.25.0:

- `pnpm install --frozen-lockfile`: passed after the offline cache lacked a required tarball; no lockfile/dependency change.
- `pnpm test`: all 461 unit/component tests pass after the final focus fix. Focused reducer/controller/recovery/guard tests were run with `pnpm exec vitest run <paths>` and observed failing before their corresponding behavior was implemented.
- `pnpm test:db`: 1,075 SQL assertions pass. `pnpm test:draft-contract`: 216 TypeScript/PostgreSQL parity cases pass. `pnpm test:draft-editor`: eight real-engine→canonical→database cases pass. `pnpm test:draft-concurrency`: 25 tests across seven files pass, including independent-session create/save/replay/version/eligibility races.
- `pnpm db:types:check` matches the local schema; `pnpm supabase db lint` reports no schema errors.
- `pnpm exec playwright test`: all 74 desktop/mobile cases pass against the configured production build/start (1.2 minutes, original two workers/timeouts). Fourteen new cases cover delayed responses, duplicate submits, committed-but-dropped create/save responses, newer input and exact retries across revoked/restored access, retained created identity, independent owner/admin tabs, deliberate conflict adoption, inactive-reference repair, read-only/unsupported recovery, credited non-owner/signed-out action denial, supported navigation/sign-out cancellation and clean sign-out.
- The lost-save browser test creates 2,501 native paragraphs (over the canonical node bound) containing newer text. After replay acknowledges the earlier valid snapshot, all invalid native paragraphs/text remain visible and unsaved; correcting them permits a fresh versioned save. This proves actual editor integration rather than only a reducer flag or blocked clipboard payload.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `git diff --check`, and unfiltered `pnpm audit --prod --audit-level=high` / `pnpm audit --audit-level=high` pass. Both audits report no known vulnerabilities.

Fresh independent agent review found no blocking core/state/authorization issues. It identified lost focus when explicit loading removed its button; an observed failing form regression now requires Title focus after reload. Review also identified an invalid-native-text coverage gap, closed by the real-browser case above. The final full unit/browser suites pass after these changes; no deferred code findings remain. Agent review does not replace required human review.

The navigation provider holds only a leave-check callback. App-link/sign-out cancellation preserves input and prevents sign-out transport; new-tab modifiers and same-page anchors remain usable. The browser checks confirm best-effort full-document reload cancellation and actual clean synthetic-session sign-out. Same-document Back/Forward is not guaranteed blocked, and real Google issuance/refresh/hosted session assurance remains outstanding. No draft data enters localStorage/sessionStorage or a global content store.

Inspect the [desktop recovery](reviews/assets/phase-3-task10-desktop.png) and [mobile recovery](reviews/assets/phase-3-task10-mobile.png). Images were visually inspected; capture scrolls to the top to avoid an off-viewport fixed SkipLink artifact. The browser suites use separate collision-checked save/recovery actor/catalog namespaces. Original public/private/auth.identities fingerprints match across all 14 tables after browser/concurrency cleanup; only established synthetic auth.users test metadata is excluded. No reset, schema/grant/migration or dependency change occurred. Private gate logs/fingerprints remain in this task's ignored workspace for Task 11.

At Task 10 completion, hosted CI and Task 11 whole-slice verification remained outstanding. PR #25 later merged to `main` with passing hosted CI; Task 11 verification is recorded below. Human screen-reader/security review and real hosted Google session coverage remain launch work.

## Phase 3 Task 11: integrated verification

Task 11 preserves the original local project and separately proves both an upgrade with populated legacy/canonical/NULL content and a clean install. The original 14-table Task 10 fingerprint matches before and after the task; the pre-Task-2 comparison matches 12 historical tables, with only the known synthetic browser metadata difference in `auth.users`. The old baseline had no content rows, so it is not represented as populated-content proof.

The disposable upgrade fixture carried three articles, taxonomy links, guest/multiple-role credits, one existing revision and one audit row through all seven Phase 3 migrations. Original rows remained unchanged; each article gained `edit_version=1`, history was not rewritten or fabricated, and new private receipt/quota tables remained empty. A subsequent isolated reset installed all 15 migrations and the committed seed with content/history/association/receipt/quota tables empty. The isolated project was stopped; the original project was not reset or stopped.

Fresh whole-slice review found one Important category-read redirect defect. A signed-out or revoked session could trigger a server-action redirect and unmount a dirty editor. The action now checks access without redirecting and returns safe denial/unavailable results. Focused RED→GREEN unit and desktop/mobile tests cover signed-out and inactive access, valid text and invalid native editor input. See the [Task 11 review evidence map](reviews/phase-3-private-drafts.md) for gate counts, proof limits and outstanding human/provider work.

The first hosted run also found that an existing new-tab browser assertion used the macOS modifier unconditionally. It now chooses the platform modifier; the focused desktop/mobile case and complete local browser suite pass after the fix. The replacement exact-head hosted run passed on verification commit `dfacc04` ([run 40794333210](https://github.com/dylandrozario/the-gavel/actions/runs/40794333210)); the Task 11 pull request reruns the workflow on its head.

Local gates on the final application source pass: 463 unit/component tests, 1,075 SQL assertions on both the preserved and clean isolated projects, 216 contract-parity cases, eight real editor/database parity cases, 25 independent-session concurrency cases, and 78 desktop/mobile browser cases. Format, lint, strict TypeScript, database types, schema lint, unfiltered production/full audits and the production build/start also pass. The exact-head hosted workflow result and run URL are included in the Task 11 owner handoff. Human screen-reader/security review and real hosted Google session coverage remain separate launch work.

## Phase 4 Task 2: generated article draft slugs

Forward migrations `20261102000000`–`20261102000300` replace the draft validator and create/save function bodies without rewriting existing article/profile rows or receipt records. New application write payloads omit `slug`. The database derives a unique article slug from title using `unaccent`, lowercase ASCII words, collapsed hyphens, an `article` fallback, a 180-character limit, and a transaction-serialized numeric suffix. A draft save follows title changes; a published article remains unavailable to the draft save operation. Exact old slug-bearing requests can replay their committed receipt. Valid old payloads can also create/save during a mixed-version rollout, but their supplied slug is ignored; the compatibility database migration must precede the new app deployment.

The new pgTAP suite covers direct forged create/save calls, normalization and limits, duplicate titles, retained existing slugs, exact retry, legacy receipt replay, draft title changes, published-status rejection, and private helper grants. The independent-session suite adds a two-author same-title race. Unit/component tests reject supplied slugs and verify no slug input remains; desktop/mobile browser journeys cover creation, generated collision suffixes, editing and recovery. Profile slug writes and published article editing remain later Phase 4 tasks.

Before migration, the preserved local database passed 1,075 SQL assertions and the application passed 463 unit tests. A private data-only snapshot was saved before applying the forward migrations without reset. After migration and the full browser suite, public/private table data and row counts match the snapshot; the five synthetic `auth.users` rows retain their IDs, while browser fixture setup changed only their `created_at`, `updated_at`, and `email_confirmed_at` timestamps and added Auth audit-log entries. No content or membership row was replaced.

On Node 22.20.0 / pnpm 11.25.0, `pnpm test:db` passed 1,105 assertions; `pnpm test` passed 463; `pnpm test:draft-contract` passed 214 shared cases; `pnpm test:draft-editor` passed eight; `pnpm test:draft-concurrency` passed 26 across seven files; and `pnpm test:e2e` passed all 78 desktop/mobile cases. Strict types, source lint, formatting, database lint, and generated-type drift passed. The full browser suite built and started the production app. [Desktop](reviews/assets/phase-4-task2-desktop.png) and [mobile](reviews/assets/phase-4-task2-mobile.png) screenshots show the slug control removed. Hosted CI remains to be recorded on the PR head.

## Phase 4 Task 3: private article media in progress

The additive cleanup migration marks unused assets before Storage deletion and refuses current or historical relational image references. The editor offers upload, attachment, metadata updates, unlinking and discard of unused uploads. Focused tests and desktop/mobile browser journeys cover valid WebP promotion and corrupt-file rejection. The complete database suite passed 1,175 assertions, including private Storage visibility and denials; independent-session attachment/removal races passed in both lock orders (28 concurrency tests total). The unit suite passed 499 cases; the complete browser suite passed 80 desktop/mobile cases. Strict types, schema lint, generated-type drift, draft contract parity (214), real editor/database parity (8), code lint and formatting passed. The production build completed as part of the full browser run. The high-severity dependency audit passed with one moderate development-only `minimatch` advisory (GHSA-g3hv-75wg-m249). Review and hosted CI remain pending. [Desktop](reviews/assets/phase-4-task3-desktop.png) and [mobile](reviews/assets/phase-4-task3-mobile.png) screenshots record the private control.

A sorted row-hash comparison of the 13 historical public/private tables against the pre-Task-3 snapshot matched after all migrations and browser fixtures. The snapshot had four existing memberships and profiles and no article/content rows, so this proves preservation of those existing identity rows but not a populated article migration.

The preserved Task 2 branch passed 463 unit tests and 1,105 SQL assertions before Task 3 changes. A private data-only snapshot was saved before additive media migrations; the populated local project was not reset. The media database slice passed 1,154 pgTAP assertions: role/Storage denials, finalization, pending and foreign asset rejection, versioned/no-op main-image attachment, exact retry, revised snapshot, credited non-owner denial, administrator removal, and retained-asset restriction. The real image processor and bounded multipart reader passed 13 focused Vitest cases for JPEG/PNG/WebP decoding, re-encoding, MIME mismatch, corrupt bytes, 10 MiB input, dimension/pixel limits, and stream bounds. The checked reservation action passed four focused cases; the upload route passed five focused cases including denial, MIME forgery, actual WebP output, and uncertain-upload retry. The route slice passed all 485 unit tests, lint, formatting, production build and strict types (rerun after the build completed). Cleanup, dashboard attachment, browser checks, and hosted CI remain pending.

## Phase 4 Task 5: published article editing

The new published-save pgTAP file passed 28 assertions covering owner and administrator writes, cross-owner and credited non-owner denial, inactive and anonymous access, protected fields, readiness, no-op, stale version, exact replay after later edits, archived denial, and unchanged slug/publication time. The full database suite passed 1,234 assertions. Existing draft operations remained green. Strict types, lint, format, database type drift, and schema lint passed. The full unit suite passed 521 tests; draft payload parity passed 214, editor/database parity passed eight, and independent-session concurrency regressions passed 30. The focused desktop/mobile browser suite passed four cases for dashboard entry, owner/admin save and reopen, version conflict recovery, and archived read-only behavior; Playwright built the production app. These runs use local synthetic Supabase. Hosted CI and a second maintainer review remain outstanding. The [Task 5 plan](superpowers/plans/2026-11-04-published-article-editing.md) records scope and decisions.

## Phase 4 Task 6: owner article lifecycle

The full local database suite passed 1,277 pgTAP assertions, including 43 new lifecycle assertions for publish readiness, owner/admin authority, anonymous/cross-owner/inactive denial, stale status/version, exact replay, rollback, and atomic history. The full unit suite passed 529 tests. Draft contract parity passed 214 cases and the full independent-session concurrency suite passed 31 cases, including publish/archive races with saves. Generated database types, schema lint, TypeScript, lint, and formatting passed. Six desktop/mobile browser cases passed for confirmation, publish/archive, unready draft, cross-owner access, and archiving a published legacy body; Playwright built the production app. These runs use local synthetic Supabase. Hosted CI and human review remain outstanding. The [Task 6 plan](superpowers/plans/2026-11-04-owner-article-lifecycle.md) records scope and decisions.

## Phase 4 Task 7: administrator article management and restore

The full local database suite passed 1,309 pgTAP assertions, including 32 new restore cases for administrator authority, owner/inactive/anonymous denial, readiness, stale/wrong status, exact replay, publication identity and audit rollback. The full unit suite passed 538 tests; one later not-found page assertion passed in its focused rerun. Draft contract parity passed 214 cases, editor/database parity passed eight, and independent-session concurrency passed 32 cases, including an administrator restore racing an owner save. TypeScript, lint, format, schema lint and generated-type drift checks passed. Six desktop/mobile browser cases covered all-owner listing, filters, restore confirmation, role denial, invalid cursor recovery and inactive administrator access; Playwright built the production app. These use local synthetic Supabase. Hosted CI and human review remain outstanding. The [Task 7 plan](superpowers/plans/2026-11-05-admin-article-management.md) records scope and decisions.

## Phase 4 Task 8: administrator article audit history

The additive audit-reader migration was applied to the existing local database without reset. The full pgTAP suite passed 1,320 assertions, including 11 new checks for administrator access, author/inactive/anonymous denial, bounded/filter/cursor inputs, safe actor label and archived-resource retention. The full unit/component suite passed 547 cases, including eight new query and page cases. Six desktop/mobile browser cases passed for administrator navigation, action filtering, keyboard pagination, author/inactive denial and invalid-cursor recovery; Playwright built the production app. TypeScript, lint, format, schema lint, and generated database type comparison passed. These use local synthetic Supabase; hosted CI and human review remain separate checkpoints. The [Task 8 plan](superpowers/plans/2026-11-05-admin-article-audit.md) records scope and decisions.

## Phase 4 Task 9: administrator membership management

The upgraded local database passed 1,366 pgTAP assertions. The full unit/component suite passed 565 tests, and two independent-session cases proved duplicate approval, stale deactivation, and competing administrator demotion behavior. Four desktop/mobile browser cases passed for approval, role change, deactivation, activity, author denial, and invalid-cursor recovery; Playwright built the production app. TypeScript, targeted lint/format, schema lint, and generated type comparison passed. The existing local project was preserved; a clean migration rebuild and hosted CI remain to be checked in the PR. The [Task 9 plan](superpowers/plans/2026-11-06-admin-memberships.md) records decisions and proof limits.

## Phase 4 Task 10: administrator contributor profiles

The upgraded local database passed 1,399 pgTAP assertions. The full unit suite passed 573 tests and the concurrency suite passed 35 cases; a later focused run also passed both deactivation versus publication and rename versus published credit. Four desktop/mobile browser cases passed for guest creation, edit, deactivation, author denial, and cursor recovery; Playwright built the production app. Schema lint, TypeScript, lint, formatting, and generated type comparison passed. A clean migration rebuild, hosted CI, and human review remain pending. The [Task 10 plan](superpowers/plans/2026-11-06-admin-contributor-profiles.md) records decisions and proof limits.

## Phase 4 Task 11: administrator taxonomy

The upgraded local database passed 1,420 pgTAP assertions, including role denial, bounded reads, reference and parent guards, protected label, stale writes, retry receipts and retained article links. The full unit suite passed 582 tests; two focused control tests passed again after retry-state handling changed. The full concurrency suite passed 38 cases, including both publication/deactivation interleavings. Four desktop/mobile browser cases passed for section/category editing, read-only tags, author denial and cursor recovery; Playwright built the production app. TypeScript, targeted lint/format, schema lint and generated type comparison passed. The local project was preserved; clean migration CI and human review remain pending. See the [Task 11 plan](superpowers/plans/2026-11-06-admin-taxonomy.md).

## Phase 4 Task 12: own public profile

The upgraded local database passed 1,441 pgTAP assertions for own-only access, role and eligibility denial, generated/frozen slugs, stale writes, exact retry, no-op and audit. The full unit suite passed 590 tests and the full concurrency suite passed 40 cases; three focused races then passed after the identity-lock migration, covering admin edits, publication freeze and identity revocation. Four desktop/mobile browser cases passed for own edits, slug behavior and signed-out denial; Playwright built the production app. TypeScript, targeted lint/format, schema lint and generated type comparison passed. The local database was preserved; a clean migration rebuild, hosted CI and human review remain pending. See the [Task 12 plan](superpowers/plans/2026-11-07-own-public-profile.md).

## Phase 4 Task 13: homepage curation

The upgraded local database passed 1,478 pgTAP assertions, including authorization, slot limits, duplicate and invalid selections, fallback ordering, stale writes, exact retry after later changes, and atomic audit rollback. The full unit suite passed 600 tests; twelve focused homepage/navigation tests passed again after the final guard change. The full concurrency suite passed 43 cases, including both selection/archive interleavings. Three desktop/mobile browser cases passed for desktop saving, catalog navigation, mobile selection and role denial; the mobile write case is skipped because both projects share one singleton. Playwright built the production app. TypeScript, targeted lint/format, schema lint and generated type comparison passed. The local project was preserved; clean migration CI and human review remain pending. See the [Task 13 plan](superpowers/plans/2026-11-07-homepage-curation.md).

## Phase 4 Task 14: site information

Task 14 adds database tests for administrator, author, inactive, anonymous, and ineligible paths; input bounds and unsafe links; version conflicts, exact retries, no-op saves, and audit rollback. A two-session test checks concurrent saves serialize. Local verification passed 1,465 database assertions, the 42-case concurrency suite, 597 unit tests, types, lint, schema lint, and three desktop/mobile browser cases (one mobile write skipped because the settings record is shared). Three focused form tests passed after adding conflict and unsaved-input coverage. The local database also contains Task 13 migrations; generated Task 14 types were compared after excluding those independent schema additions. Clean-install migration CI and human security/accessibility review remain outstanding.
