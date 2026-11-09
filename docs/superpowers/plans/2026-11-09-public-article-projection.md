# Phase 5 Task 2 — public article detail projection

Status: implemented on `feat/public-article-projection`, stacked on Task 1 PR #50 at `9665cc3`. [Reader contract](2026-11-09-phase-five-reader-contract.md) defines public fields and visibility. No reader route, public media Storage grant, list/search or cache is part of this task.

## Acceptance and design risks

- A single bounded, security-definer SQL projection reads by canonical slug and returns only published article, public active taxonomy/credit/profile fields and finalized current-media descriptors. Anonymous and authenticated roles see the same output; direct base-table grants and private owner/admin queries stay unchanged.
- Null/unknown/draft/archived/deleted/malformed slugs all produce the same not-found result. Invalid/unsupported published bodies return a generic unavailable result, never unvalidated JSON. No raw storage keys, auth/membership information, private receipts, history or caller-supplied identity appear.
- Article body, version, main image, active taxonomy, credits and live body-image descriptors must come from one database statement snapshot. A concurrent archive completed before a new statement makes it disappear; in-flight responses cannot be recalled. Bound all text, arrays, body nodes and result payload.
- The adapter uses a server-only anonymous-key Supabase client with no cookies, service key or persistent caching; it validates the full response and maps errors to unavailable. Authenticated browser cookies cannot change this public lookup.
- Public media URLs/Storage access and HTML rendering remain later tasks; descriptors are IDs and safe dimensions/alt/credit, not object paths or URLs. Missing/inactive associations must not cause private metadata disclosure.

## Focused steps

1. Add transaction-local pgTAP tests demonstrating role parity, exact allowed keys, secret-key exclusions, safe malformed/unknown/status/body outcomes, association isolation, image eligibility and retained direct-read denials. Run RED first.
2. Add one forward migration/RPC with validated bounded input and a fixed search path; leave existing tables/policies untouched. Run focused SQL and local schema/type checks.
3. Add the checked public reader client, schemas and server adapter with focused tests for invalid payloads, thrown errors, no cookie/client-secret paths and no-store fetch. Run fast checks and the relevant SQL/contract suite.
4. Review the slice once; verify archive/release behavior, migration upgrade/clean install on a disposable project where possible, and security/docs. Commit cohesive pieces and open a draft PR stacked on #50; owner watches CI.

## Verification

- The focused database test covers public/private lifecycle, role parity, direct-read denial, invalid bodies, and finalized current-image descriptors.
- Adapter tests cover malformed data, Unicode field lengths, error handling, and the cookie-free, no-store client. A focused review identified the Unicode length mismatch and it was corrected.
- Existing databases received the additive migration; a disposable clean database applied all migrations through Task 2 and passed the same 21 assertions. `pnpm db:types:check`, `pnpm supabase db lint --local`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build` passed.
- `pnpm test` passed 657 tests. An earlier concurrent run was interrupted after unrelated tests timed out; the affected tests passed afterward.
