# Phase 1 foundation review

Status: Automated gates and agent review complete for the reviewed foundation; human maintainer review not recorded. Phase 2 planning can proceed while the foundation review remains open. This is not production-launch approval.

## Review evidence

- PRs [#1](https://github.com/dylandrozario/the-gavel/pull/1) and [#2](https://github.com/dylandrozario/the-gavel/pull/2) are merged. The latter contains the approved temporary CI audit exception.
- [Hosted run 39349263352](https://github.com/dylandrozario/the-gavel/actions/runs/39349263352) passed for main commit `66f2f82d195c65723762ae101cfad8147068a611`: frozen install, formatting, lint, types, unit/component tests, secret scanning, database reset/pgTAP/lint/type drift, build, desktop/mobile browser tests, unfiltered production audit, and full audit with the approved exception.
- The 2026-10-20 read-only review sub-agent inspected the foundation through `080dfce`. Its file contents match the merged `66f2f82` tree. No blocking code/security defect was confirmed; domain boundaries were appropriate and no broad refactor was recommended. The review identified documentation cleanup and a session test coverage limitation.
- This evidence does not prove real hosted Google OAuth, full accessibility, deployed headers, or zero vulnerabilities. The audit exception accepts a known development finding; it does not repair it.
- GitHub's submitted-review lists for PRs #1 and #2 were empty when checked on 2026-10-20. This means no submitted human review was recorded there; it does not establish whether someone inspected the code elsewhere.

## Tracked follow-ups

- Human review: follow the steps below; record actual outcomes before closing the foundation review.
- Session test gaps: [authoritative coverage checklist](../testing.md#session-coverage-still-needed-before-hosted-launch). These need automated implementation plus a real-provider smoke test before hosted launch; they are not tasks the maintainer must implement personally.
- Dependency exception: follow [ADR 0005](../decisions/0005-temporary-ci-audit-exception.md) and remove the CI ignore after compatible upstream remediation.
- Auth-identity deletion remains an unresolved operational constraint in [ADR 0003](../decisions/0003-trusted-membership-identity.md). Use membership deactivation; this review does not select a deletion policy.

## Maintainer review steps

1. Open the linked successful CI run and confirm its commit. Expand the database, browser, and audit steps. If reviewing later code, use that code's CI run instead; an older green run is not evidence for new changes.
2. Open PR #1's Files changed and compare the implementation with the [foundation acceptance criteria](../superpowers/plans/2026-10-17-project-foundation.md#foundation-milestone-acceptance). Read PR #2 for the narrow audit change. Focus on the review map below; article editing, publishing, and hosted deployment are not implemented foundation features.
3. Arrange a second human maintainer with TypeScript/Supabase security experience to inspect the sensitive code and tests. Give them the CI link, acceptance criteria, review map, and known follow-ups. If you authored the work or are the sole maintainer, your own check and the agent review do not satisfy the documented second-maintainer requirement. Keep it outstanding until someone reviews; no need to invent approval or a new policy exception.
4. Run the local application using [README setup](../../README.md#local-setup), in a checkout with local Supabase and the ignored `.env.local` configured. Visit `/`, `/sign-in`, `/access-pending`, and signed-out `/dashboard`; the dashboard must redirect to sign-in. Check narrow/mobile layout, keyboard Tab/Shift+Tab, visible focus, skip-to-content, and readable labels. Record actual results. Local Google sign-in is not configured; do not report real Google authentication as passed. Automated synthetic-identity tests provide the current author/admin/inactive denial evidence.
5. Have the reviewer check role and ownership denials in the database tests, not just hidden UI links. Record any defects with a file, reproduction, expected behavior, and severity. Request focused fixes and rerun affected checks before accepting a blocking finding as resolved.
6. Record the reviewer's name, reviewed commit, date, results, and remaining limitations in a review comment on the original PR or a linked review issue. Since the PRs already merged, this is a post-merge review record, not retroactive pre-merge approval. Use the template below and replace placeholders with actual evidence. Do not include credentials or session values.
7. Link the human review record here or in the phase plan and close the foundation-review task only when the acceptance criteria and required review are evidenced. Keep pre-launch coverage and unresolved decisions visible as separate follow-ups. Phase 2 planning does not imply production readiness.

## Code review map

| Area                     | Files                                                                                                                    | What to verify                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Session and eligibility  | `src/lib/auth/access.ts`, `src/lib/auth/actions.ts`, `src/app/(auth)/auth/callback/route.ts`, `src/lib/auth/redirect.ts` | Verified identity, confirmed Google `bc.edu` boundary, active membership, canonical safe redirects, safe failures, logout semantics |
| Cookie/session adapters  | `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`                                                | Cookie flags, refresh propagation, no shared caching; distinguish source inspection from missing integration tests                  |
| Dashboard guards         | `src/app/(dashboard)/dashboard/layout.tsx`, `src/app/(dashboard)/dashboard/page.tsx`                                     | Independent server authorization; no reliance on client navigation or proxy alone                                                   |
| Database                 | `supabase/migrations/`, `supabase/tests/`                                                                                | Explicit grants, RLS, owner/admin denials, trusted Auth metadata, fixed search paths, narrow current-profile accessor               |
| Configuration            | `src/lib/env/`, `src/instrumentation.ts`                                                                                 | Validation at boundaries, no secret values in errors or browser code                                                                |
| Shells and accessibility | `src/components/`, `src/app/globals.css`, `e2e/`                                                                         | Semantic structure, keyboard focus, responsive layout; broader assistive-technology review still needed before launch               |
| CI exception             | `.github/workflows/ci.yml`, ADR 0005                                                                                     | Production audit runs unfiltered, other findings still block, temporary ignore removal is tracked                                   |

## Human review record template

```text
Reviewed commit: <full SHA>
Reviewer: <name; identify second maintainer>
Date: <date>
CI evidence: <run link for reviewed code>
Code areas inspected: <areas from review map>
Manual checks performed and results: <actual checks only>
Blocking findings: <findings or none found within inspected scope>
Remaining limitations: <session coverage, hosted OAuth, accessibility, accepted audit risk>
Outcome: <approved within inspected scope / changes requested / incomplete>
```
