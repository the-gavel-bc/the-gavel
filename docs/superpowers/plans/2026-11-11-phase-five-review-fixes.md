# Phase 5 review fixes (PRs #65–#69)

Follow-up from a post-merge code review of PRs #65–#69. Branch `fix/phase5-review-findings` from main `9269c86`; independent of Task 21 (PR #70).

## Findings and outcomes

- Fixed (#69): the letters section had two self-canonical archives, `/letters` and `/sections/<letters-slug>`. `getPublicArchive` now gives the letters section the `/letters` href in both cases, so canonical metadata and pagination links agree. Letters categories keep their section-scoped paths.
- Fixed (#67): the search input allowed 320 characters while the documented and enforced limit is 160 normalized characters. The input now caps at 160. `maxLength` counts UTF-16 units, so it is never looser than the server's code-point limit.
- Fixed (#68): the contact link encoded `@` as `%40`. The local part is still percent-encoded (it may contain `?`, `#` or `%`); the literal `@` and the validated domain are kept.
- No change (#65/#66): the review claimed search could use about four CPU cores (120 searches × 2 s timeout). Admission holds a transaction advisory lock for the whole search, so searches are serialized and the ceiling is about one core. Task 16 measured the common-word case at about 54 ms on 10,000 articles. The existing 2 s deadline, budget and HTTP proofs stand.
- Not changed (#68): unavailable information pages return HTTP 200 with noindex/no-store. App Router pages can only signal 404 or redirect, or throw to an error boundary (500); article and archive unavailable states behave the same way. A 503 for reader pages needs a cross-route decision, recorded for Task 23.

## Verification

- Unit: 814 tests in 129 files with `--maxWorkers=2`; 813 passed. The one failure was the import-boundary test's known five-second timeout under parallel load (also recorded in Task 17); rerun alone, all 13 import-boundary tests passed. New cases cover the letters section canonical and the 160-character cap; the mailto expectation is updated.
- `pnpm typecheck`, `pnpm lint` and `pnpm format:check` passed. Typecheck first failed on stale `.next/types` from another branch's build; after removing that generated directory it passed.
- Not run locally: the Playwright suite (one `public-information` expectation changed) and SQL suites (no SQL changed). The browser suite uses the fixed local project, which was not modified; hosted CI runs it.
