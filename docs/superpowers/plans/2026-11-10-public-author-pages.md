# Phase 5 Task 15 — public author projection and page

Status: implementation on `feat/public-author-pages`, based on Task 14 PR #63, still open. Target main; #63 remains a prerequisite while open. Task 13 PR #62 is merged.

## Scope, decisions and acceptance

- Implement `/authors/[slug]` using the shared sectionless archive grid, twelve-card owner-or-contributor list scope and a public biography component. Show one display-name h1, escaped plain biography with paragraph breaks when supplied, native section/story links and pagination. Do not invent profile images or empty biography copy.
- Existing profile column grants and anonymous active-only RLS already support the approved public projection. Read exactly display_name/slug/biography with explicit active=true through the cookie-free, no-store publishable client; validate strict bounds and matching slug, map to browser-safe displayName/slug/biography only. No Auth/membership joins, identity ID, email, role, timestamps or service key in the projection. No migration or grant expansion is needed.
- Unknown, malformed and inactive profiles share real 404 even for signed-in owners/admins. Active guests and active profiles with no public articles remain valid pages; inactive membership alone does not retract an active public biography or published journalism. Public listing SQL remains authoritative for owner-or-credit visibility, active article references and deduplication across roles/tags/ownership.
- Reuse scope-bound opaque cursors, safe repeated/malformed/cross-author rejection, noindex errors, empty/final states and first-page recovery. Metadata/page share a request-scoped result only; no loading boundary precedes scope eligibility. Live requests can reflect later archive/reference changes; no frozen browsing snapshot, mutation retry or conflict protocol is introduced.
- Keep the reader under the existing `backend/public-articles` public archive domain, rather than creating a parallel `backend/reader` tree. A small shared public author DTO is consumed by the validated reader and biography component. Add an optional presentation slot to ArchiveGrid instead of duplicating grid/empty/pagination composition or adding a pass-through page wrapper.
- Preserve generated/frozen author URLs and all editorial writes, RLS and image boundaries. Profile images and complete SEO remain separate approved gates. Human visual/security/screen-reader review remains outstanding.

## Implementation and validation

1. Add failing checked query, biography/slot and thin route tests; implement the existing-policy projection, browser-safe DTO and route in coherent commits.
2. Add rollback-only SQL assertions for active public fields, guest/empty/inactive profiles, owner/multi-credit deduplication, inactive membership retention, private/archived exclusion and cursor identity. Do not reset the database.
3. Run focused units/types/lint during build. Review once, then run full units, relevant SQL, formatting and production desktop/mobile author/tag regressions once. Browser checks cover byline/credit links, biography escaping, guest/empty/inactive profiles, owner parity, bounded/final/cross-author pages, focus and 320px/no-JavaScript use.
4. Record commands/results and limits here, update API/component docs and STATUS, then open a main-targeting draft PR. Owner monitors hosted CI; remove synthetic fixtures and stop test services.

Rollback: revert application consumers/reader; no stored data, schema, authorization or lifecycle migration changes.
