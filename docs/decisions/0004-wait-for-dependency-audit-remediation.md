# 0004: Wait for dependency audit remediation

- Status: Accepted — maintainer chose to wait; no exception is active
- Date: 2026-10-19
- Related requirements: [Security gates](../testing.md#ci-and-security-gates), [foundation plan](../superpowers/plans/2026-10-17-project-foundation.md)
- Supersedes / superseded by: None

## Context

The full dependency audit reports one high-severity finding: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Deeply nested brace patterns can exhaust the Node.js call stack. The installed `braces@3.0.3` is affected, and the advisory and npm registry list no patched release as of 2026-10-19.

The only reported path is:

```text
.>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces
```

The current upstream Next.js ESLint packages still require this chain. Updating its packages to their latest published versions does not remove the affected parser.

The installed Next.js ESLint plugin imports `fast-glob` only in `get-root-dirs.js`. It invokes the glob parser when `settings.next.rootDir` supplies a pattern. Our effective configuration has no such setting and uses the current working directory directly. This limits current exposure; it does not repair the vulnerable package or guarantee future configurations are safe. The production-only audit reports no known vulnerabilities.

## Decision

Wait for an upstream fix or another verified remediation. The maintainer selected this approach on 2026-10-19 after reviewing the temporary exception and local-patch alternatives.

Keep the direct `pnpm audit --audit-level=high` gate unchanged and failing while the finding remains. Do not activate an exception, suppress the advisory, or replace the full audit with a production-only audit. No local dependency patch is selected.

Recheck the advisory and dependency chain when remediation becomes available. Validate any candidate against the full audit and the affected lint checks before claiming the blocker resolved.

## Alternatives considered

- A temporary, narrowly checked development-only exception: proposed but not approved; leaves the affected code installed.
- A local patch with regression tests: potentially addresses the recursive traversal, but introduces maintenance and compatibility obligations. Version-based auditing may still report the affected version.
- Replacing the dependency chain: requires compatibility and lint-coverage verification before adoption.
- Advisory-wide ignores or ignoring all unfixable advisories: hide more than the reviewed exposure and are not selected.

## Consequences

The dependency audit and full foundation milestone remain blocked. The feature branch can be pushed and reviewed in a draft PR, with hosted CI expected to report the audit failure if preceding checks pass. Hosted CI execution and maintainer review remain separate completion requirements.

No application, database, dependency, or CI behavior changes. There is no exception to roll back.

## Validation

Evidence collected on 2026-10-19 using Node.js 22.20.0 and pnpm 11.25.0:

- `pnpm audit --json`: exit 1; one high finding, zero critical findings; `braces@3.0.3`, development-only, exact path above, no patched version.
- `pnpm why braces`: confirms the single development dependency chain.
- `pnpm audit --prod --audit-level=high`: exit 0, no known vulnerabilities.
- ESLint `calculateConfigForFile('src/app/page.tsx')`: no `settings.next` configuration; `@next/next/no-html-link-for-pages` remains enabled at error severity.
- Read the installed plugin's glob import and call sites and checked latest dependency metadata in the official npm registry.

No remediation has been implemented or verified. No audit bypass, dependency change, or CI modification has been made.
