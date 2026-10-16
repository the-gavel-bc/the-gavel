# 0001: Use a server-first Next.js, Vercel, and Supabase architecture

- Status: Accepted
- Date: 2026-10-16
- Related requirements: [Product requirements](../product-requirements.md)
- Supersedes / superseded by: None

## Context

The Gavel needs a public publishing site with a small approved editorial membership. Its previous WordPress/SiteGround installation was compromised. The replacement should minimize server and plugin maintenance, enforce article ownership, support Google identity, and remain transferable between student leadership teams.

## Decision

Use a server-first Next.js TypeScript application on Vercel. Use Supabase Auth with Google, PostgreSQL with grants and Row Level Security, and Supabase Storage. Browser mutations go through Next.js server operations and remain independently constrained by RLS. Use separate staging and production services.

## Alternatives considered

- Direct browser-to-Supabase for most operations: faster initially, but exposes more data operations to the client and makes workflow/audit enforcement less centralized.
- Separate custom backend service: strong separation but unnecessary deployment and operational complexity for the MVP.
- Rebuild on WordPress: mature publishing features, but retains a larger plugin/server administration surface than this focused product requires.

## Consequences

The system gains managed infrastructure and defense-in-depth authorization. The team must still design, test, and maintain RLS, secure server operations, content sanitization, uploads, dependencies, backups, and provider accounts. A custom editor/dashboard requires more initial development than configuring WordPress.

## Validation

Before launch, authorization tests must cover direct RLS access and server operations for anonymous, inactive, two distinct authors, and administrator identities. Production build, preview protection, security headers, migrations, and restoration must also be verified.
