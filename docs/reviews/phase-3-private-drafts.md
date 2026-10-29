# Phase 3 private drafts: integrated verification

Status: local verification and fresh code/security review complete. The verification branch also includes the unmerged Task 10 implementation. The exact-head hosted workflow result and run URL are reported in the Task 11 owner handoff.

## Data preservation and installation

The original local project was never reset or stopped. Its 14 public/private/`auth.identities` row fingerprints match the Task 10 snapshot before and after Task 11. Against the original pre-Task-2 snapshot, 12 tables match; the only difference is the previously documented synthetic browser metadata in `auth.users`. That old baseline had five Auth users and four profiles/memberships, but no articles, taxonomy, associations or history.

To prove a populated upgrade as well, a separate disposable project used a Phase 2 schema and synthetic fixtures: a NULL-body article, a supported canonical-body article, a legacy JSON article, category/tag links, writer plus guest multi-role credits, an existing revision and an audit row. All 14 preexisting table fingerprints were preserved across the seven Phase 3 migrations. All three articles received `edit_version=1`; no history was fabricated and all three new private receipt/quota tables were empty. Transactional role checks denied anonymous reads and direct writes, allowed owner/admin reads, and showed that a credited non-owner could not read the draft.

That same disposable project was reset only after its upgrade evidence was saved. Its clean install applied 15 migrations and the committed four-identity seed; article, association, history, receipt and quota tables were empty. All 25 SQL test files passed (1,075 assertions), schema lint found no errors, and generated database types matched the committed file. The isolated project was stopped after the evidence was saved.

## Code review and regression

Fresh whole-slice review covered the accepted contract and Tasks 2–10, including all seven Phase 3 migrations, database grants/authorization, format/history compatibility, quotas/locks/version/replay and editor recovery. It found one Important issue: category refresh used a redirecting membership guard. When access expired or was revoked while an editor had unsaved changes, the action could navigate away and unmount the form. A focused unit and desktop/mobile regression reproduced it before the fix.

The action now uses `getCurrentAccess()` and returns safe `forbidden`/`unavailable` results without redirecting or reading catalogs on denial. The API/security docs describe this behavior. Six focused unit tests and four desktop/mobile access-loss cases pass; the browser cases retain both valid and native-invalid editor input. No Critical findings or other blocking findings were reported. The fix changes no schema, grants, access model, or write authority.

## Local gates

All commands were run on Node 22.20.0 / pnpm 11.25.0 against the current branch source. The complete desktop/mobile suite includes the configured production build/start.

| Gate                                           | Result                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Frozen dependency install                      | Passed; lockfile unchanged                                 |
| Format, lint, strict TypeScript                | Passed                                                     |
| Unit/component suite                           | 463 tests passed                                           |
| SQL suite on original project                  | 1,075 assertions passed                                    |
| SQL suite on clean isolated install            | 1,075 assertions passed                                    |
| TypeScript/PostgreSQL draft-contract parity    | 216 tests passed                                           |
| Real editor/canonical/PostgreSQL parity        | 8 tests passed                                             |
| Independent-session concurrency                | 25 tests passed across 7 files                             |
| Desktop/mobile browser suite                   | 78 cases passed; production build/start passed             |
| Database type drift                            | Matched on original and isolated schemas                   |
| Schema lint                                    | No errors on isolated clean schema                         |
| Production and full dependency audits          | No known vulnerabilities                                   |
| Gitleaks history scan and exact-head hosted CI | Run on final branch head; result linked from owner handoff |

Earlier desktop/mobile selector and recovery captures remain linked from [testing evidence](../testing.md). Current selector screenshots were refreshed by the full Playwright run and visually inspected. Automated keyboard/focus/navigation checks pass; this does not establish manual screen-reader or human security certification.

## Remaining launch work

Real Google OAuth issuance, refresh and logout; hosted provider/security-header setup; human screen-reader and security review; backup restoration and retention/deletion exercises; same-document Back/Forward leave protection; public article views, publishing/lifecycle, media and taxonomy management; and unresolved client decisions remain outside this verification. See [testing](../testing.md), [deployment](../deployment.md), the [accepted contract](../superpowers/specs/2026-10-22-private-draft-workflow-design.md), and [Task 10 recovery evidence](../testing.md#phase-3-task-10-save-and-conflict-recovery).
