# 0002: Standardize the application foundation

- Status: Accepted
- Date: 2026-10-17
- Related requirements: [MVP design](../superpowers/specs/2026-10-16-the-gavel-mvp-design.md), [architecture](../architecture.md), [testing](../testing.md)
- Supersedes / superseded by: Not applicable

## Context

The project needs a reproducible, maintainable web foundation before content and authorization behavior can be implemented. Tool choices must support server-first rendering, strict types, accessible component tests, browser journeys, and a local Supabase security boundary without introducing a broad UI framework.

## Decision

Use Node.js 22 and the exact pnpm version recorded in `package.json`. Build with the Next.js App Router under `src/`, strict TypeScript, and CSS Modules plus global CSS. Use Vitest and Testing Library for unit and component behavior, Playwright for browser behavior, and the Supabase CLI for local database tests.

## Alternatives considered

- npm was not selected because pnpm provides deterministic installs and efficient dependency storage while retaining a standard lockfile workflow.
- The Pages Router was not selected because the approved architecture is server-first and new development benefits from App Router layouts and server components.
- Tailwind CSS and a component library were deferred so the publication can establish its own small design system without premature dependencies.
- Jest was not selected because Vitest provides a fast TypeScript-oriented runner with a compatible Testing Library workflow.

## Consequences

Contributors need Node.js 22, Corepack/pnpm, and a Playwright browser runtime. Later database tasks also require a Docker-compatible runtime. The project gains one documented toolchain across local development and CI, but upgrades to Node, pnpm, Next.js, or test runners must be deliberate and include lockfile verification.

## Validation

The foundation is accepted when formatting, linting, strict type checking, the homepage component test, and a production build succeed using the recorded toolchain. Browser and database gates become authoritative as their planned tasks are implemented.
