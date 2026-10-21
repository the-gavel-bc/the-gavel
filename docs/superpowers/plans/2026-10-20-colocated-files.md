# Colocate related implementation files

Status: Implemented and locally verified; hosted CI and PR review pending. Requested organization refactor; no product behavior or database/API contract changes.

## Acceptance criteria

- Each reusable component and library module has a named folder containing its implementation and existing companions.
- Component-owned CSS is colocated as CSS Modules; shared tokens/reset/focus and reusable layout/button styles remain shared.
- Browser suites and scripts use named folders; imports, mocks, configuration, type generation, and live documentation paths resolve.
- Next.js and Supabase tool-mandated entry points and sequential migration conventions remain valid.
- No placeholder companions, dependency changes, authorization changes, schema changes, or new product features.

## Execution and verification

1. Establish baseline: 44 unit tests, type checking, and lint passed before restructuring.
2. Move components/modules and companions; update imports and tooling paths. Extract existing component CSS without changing declarations or responsive breakpoints.
3. Update authoritative conventions and affected documentation.
4. Verify formatting, lint, types, the same unit tests, database type drift, production build and desktop/mobile browser tests. Inspect for stale imports and unintended generated files.
5. Commit the focused refactor for review. Rollback is a Git revert; no data migration is needed.

The branch builds on the documentation cleanup in PR #3; keep the refactor review separate. Existing Phase 1 session coverage and human review follow-ups remain unchanged.

## Verification evidence

- Before and after: `pnpm test` passed all 44 tests, `pnpm typecheck` passed, and `pnpm lint` passed.
- `pnpm db:types:check` passed using the relocated script and generated-type target.
- `pnpm test:e2e` built and started the production application and passed all 16 desktop/mobile tests. The first attempt could not launch browsers because the local Chromium executable was missing; installing it with `pnpm exec playwright install chromium` resolved that environment prerequisite.
- Library and browser-fixture moves were compared against the original content, allowing only import-path changes; no implementation differences were found.
- Live documentation paths and relative file-link targets were checked. Historical foundation plans retain their original paths as execution history.
- Independent read-only reviewer found no concrete regression or incomplete requested colocation.
- Formatting and whitespace checks passed. No dependency versions, lockfile, database migrations, or permission logic changed.
