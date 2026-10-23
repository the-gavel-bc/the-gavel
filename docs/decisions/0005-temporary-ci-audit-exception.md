# 0005: Temporarily ignore the development braces advisory in CI

- Status: Retired on 2026-10-23 — upstream advisory withdrawn; unfiltered audits clean
- Date: 2026-10-19
- Related requirements: [Security gates](../testing.md#ci-and-security-gates)
- Supersedes / superseded by: Supersedes [0004](0004-wait-for-dependency-audit-remediation.md)

## Context

[ADR 0004](0004-wait-for-dependency-audit-remediation.md) records the investigation of unpatched development dependency advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The maintainer subsequently authorized temporarily ignoring this advisory in GitHub CI, with removal once upstream fixes it.

## Decision

Run the production-only high/critical audit before configuring any exception. Then run `pnpm audit --ignore=GHSA-vfj7-8cjw-p6xm` followed by `pnpm audit --audit-level=high` in CI. The first command saves the advisory ignore to the runner's workspace configuration and does not perform the scan; the second performs the full scan with the exception.

Do not commit an ignore to `pnpm-workspace.yaml`. Local full audits continue to expose the finding. This is an advisory-wide CI exception, not a path- or version-scoped exception; the preceding production audit preserves production checking without this ignore. All other high/critical findings remain blocking. The vulnerable dependency is not repaired by this change.

Removal trigger: when upstream publishes a compatible fix, update the dependency chain and lockfile, remove the ignore command and its temporary comments from CI, and run the unfiltered full audit and lint checks. Review this exception whenever updating the lint dependency chain. The workflow TODO and testing documentation retain this follow-up; there is no automatic upstream watcher or expiry.

## Alternatives considered

- Continue blocking until remediation: superseded by the maintainer's explicit CI exception instruction.
- Add a persistent workspace ignore: would also suppress the advisory locally.
- Skip the full audit or ignore all unfixable findings: broader than the authorized exception.

## Consequences

CI may pass the dependency step with this known development finding accepted. Hosted CI and maintainer review are still required before claiming the foundation complete. No application, database, or dependency versions change.

Rollback: remove the ignore command; the existing full audit will report the advisory again.

## Validation

Verified locally using Node.js 22.20.0 and pnpm 11.25.0:

- Unfiltered production audit: exit 0, no known vulnerabilities.
- Ignore command: exit 0, saved only the requested advisory.
- Subsequent full high/critical audit: exit 0, reported one high finding with one ignored.
- Restored the original workspace configuration; no persistent ignore or lockfile change.
- Repository formatting and `git diff --check`: passed. Prettier parsed the workflow YAML successfully.
- Dedicated workflow lint was unavailable because `actionlint` is not installed in the current environment; hosted CI validation was pending at the time of this local check.

Subsequent verification: [hosted main-branch run 39349263352](https://github.com/dylandrozario/the-gavel/actions/runs/39349263352) passed for merged commit `66f2f82` on 2026-10-20, including both audit steps. Human review remains a separate requirement.

## Retirement

On 2026-10-23 the [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) is marked withdrawn. Unfiltered production and full audits of the existing lockfile report zero known vulnerabilities. The obsolete CI ignore command/comments are removed under the maintainer's earlier removal instruction; both production and full high/critical scans now run without exceptions. This records withdrawal, not a claim that braces was patched. No workspace ignore or dependency-chain override is introduced. The decision above is retained as history.
