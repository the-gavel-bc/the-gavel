# Testing and validation

Status: Foundation and Phase 2 content/history database coverage implemented; broader MVP coverage remains planned.

## Commands

Run commands with Node.js 22 and the pnpm version recorded in `package.json`.

| Check            | Command             | Current scope                                                                                              |
| ---------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Formatting       | `pnpm format:check` | Repository source and documentation                                                                        |
| Lint             | `pnpm lint`         | Next.js and TypeScript source                                                                              |
| Types            | `pnpm typecheck`    | Strict TypeScript compilation                                                                              |
| Unit/component   | `pnpm test`         | Vitest and Testing Library                                                                                 |
| Browser          | `pnpm test:e2e`     | Playwright desktop and mobile projects                                                                     |
| Production build | `pnpm build`        | Next.js production compilation                                                                             |
| Database         | `pnpm test:db`      | Local Supabase identity/content/history constraints and RLS, plus draft validation/create (926 assertions) |

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

Temporary CI exception approved on 2026-10-19: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), an unpatched `braces <=3.0.3` advisory in the Next.js ESLint development dependency chain. CI first runs an unfiltered `pnpm audit --prod --audit-level=high`, then configures this advisory ignore on the runner and runs the full high/critical audit. Other high/critical findings remain blocking. No ignore is committed to workspace configuration, so local `pnpm audit --audit-level=high` still reports this advisory.

Remove the CI ignore when a compatible upstream fix is available: update the affected chain/lockfile, remove the ignore command and temporary comments, and verify the unfiltered full audit and lint. This is an accepted temporary risk, not a vulnerability fix. See [ADR 0005](decisions/0005-temporary-ci-audit-exception.md) for scope and removal tracking.

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
