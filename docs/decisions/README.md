# Architecture decision records

Use a short record for significant decisions, such as framework choice, authentication, storage, or an API compatibility policy. Routine implementation details do not need a record.

Copy [template.md](template.md) to `0001-descriptive-title.md`, increasing the number for each new record. Mark proposed decisions clearly; preserve accepted records and link replacements when a decision changes.

## Index

- [0001: Use a server-first Next.js, Vercel, and Supabase architecture](0001-server-first-nextjs-vercel-supabase.md) — Accepted
- [0002: Standardize the application foundation](0002-foundation-tooling.md) — Accepted

- [0003: Enforce trusted identity alongside membership](0003-trusted-membership-identity.md) — Accepted

- [0004: Wait for dependency audit remediation](0004-wait-for-dependency-audit-remediation.md) — Superseded by 0005

- [0005: Temporarily ignore the development braces advisory in CI](0005-temporary-ci-audit-exception.md) — Accepted

- [0006: Store structured content behind a closed write boundary](0006-content-foundation-storage-boundary.md) — Accepted; data-only storage implemented

- [0007: Use a constrained editor and atomic private draft mutations](0007-private-draft-editor-and-mutations.md) — Accepted; validators and draft create/save implemented; editor pending
