# Browser security headers

> Keep decisions and evidence here. Requirement: [security baseline](../../security-and-permissions.md) ("Content Security Policy tailored to the application", HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP frame protection). Hardening item 3 in the [PR review](../../reviews/phase-1-5-pr-review.md).

**Goal:** Send an enforced, nonce-based Content Security Policy on every HTML document and baseline security headers on every response, without breaking server rendering, hydration, the Tiptap editor, private media previews, Google sign-in (with and without JavaScript) or public pages.

**Architecture:** The existing `src/proxy.ts` generates a per-request nonce for document routes, sets the policy on the request (so Next.js applies the nonce to its own scripts and styles) and on the response, and still refreshes the Supabase session only on its current routes. A small pure policy builder holds the directive list and is unit tested. Static headers go in `next.config.ts` for all paths. No new dependency or service.

## Baseline and decisions

Branch `feat/browser-security-headers` from main `a3146a1` in a separate worktree, leaving the owner's uncommitted primary checkout untouched.

- **Nonce, not `'unsafe-inline'`:** every route except `/_not-found` already renders per request (production build), so nonces add little cost. The root not-found boundary opts into request-time rendering so unmatched URLs also get a nonce. Partial prerendering is not used.
- **Policy:**
  - `default-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`.
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'nonce-…'`.
  - `img-src 'self' blob: data:` (editor previews and inline WebP probes; images are same-origin media routes).
  - `font-src 'self'`; `connect-src 'self'` (the browser never calls Supabase directly; the browser client module has no importers).
  - `form-action 'self' <Supabase origin> https://accounts.google.com`. The no-JavaScript sign-in form posts to a server action that redirects to Supabase and then Google, and browsers apply `form-action` to that redirect chain.
  - `upgrade-insecure-requests` only when `SITE_URL` is HTTPS, so local HTTP Supabase keeps working.
  - Development adds `'unsafe-eval'` (React debugging) and `'unsafe-inline'` styles (dev overlay). Production does not.
- **Scope:** documents only. API routes, `/_next/static`, `/_next/image`, the favicon, `robots.txt` and `sitemap.xml` are excluded from the proxy matcher, as are Link prefetch requests, following the Next.js guide.
- **Static headers (all paths):** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (legacy companion to `frame-ancestors`), `Permissions-Policy` denying camera, microphone, geolocation, payment, USB and interest-cohort, and `Strict-Transport-Security: max-age=31536000` (ignored over HTTP; no `includeSubDomains` or preload, because the final domain is not chosen). `Cross-Origin-Opener-Policy: same-origin` (sign-in uses full-page redirects, not popups).
- **Enforced, not report-only:** no reporting endpoint or service exists to collect reports. The browser checks below must show no violations on the core flows before merge.

## Acceptance and risks

- Every document response carries one CSP with a fresh nonce per request; Next.js scripts carry the matching nonce; no CSP violations on public pages, search, dashboard, the draft editor with body/main images, private media previews, admin pages, not-found pages and sign-in.
- Sign-in without JavaScript still reaches the Supabase authorize URL (verified as the redirect target; real Google OAuth remains a hosted check).
- Static headers appear on documents, API JSON, media images and static assets. Existing `X-Robots-Tag` and `Cache-Control` rules are unchanged.
- Session refresh on dashboard/auth routes keeps working and still sets `Cache-Control: private, no-store`; refreshed cookies reach downstream rendering.
- Risks: Tiptap injecting an un-nonced `<style>` (verify; pass the nonce or disable injection), third-party scripts (none today), and future embeds (video remains unapproved and would need a policy update).

## Work and verification

1. Policy builder plus unit tests (directives, nonce format, dev/HTTPS variants, Supabase origin).
2. Proxy changes (nonce for documents, session refresh composed with the CSP request headers), root not-found request-time rendering, static headers in `next.config.ts`, config test.
3. Production build plus browser checks against the disposable local Supabase project: headers, nonce on scripts, console free of CSP violations across the flows above. Then the fast checks and affected unit suites.

## Verification record

Local only; hosted CI and a production-origin check are pending.

- Unit: new policy-builder (6) and proxy (9) tests, plus a baseline-header config test; the not-found test now awaits the request-time boundary. Full suite: 991 tests in 144 files passed with `--maxWorkers=2`. Typecheck, lint and format passed.
- Production build: only `/_not-found` was prerendered before; the root not-found now renders per request.
- Browser, production build against the disposable `gavel-task21` Supabase project (the primary local project was not used):
  - A temporary spec covered public pages, 404s, search, About, sign-in, the dashboard, new-article, admin pages and an existing draft with typing in the editor. All server-rendered scripts carried that request's nonce, every visited page got a fresh nonce, and no CSP violations were recorded.
  - An injected inline event handler did not run.
  - The no-JavaScript sign-in form reached the Supabase authorize URL. With the Supabase origin removed from `form-action`, that check failed, so the entry is required.
  - API, media and robots responses carried the baseline headers without a document CSP.
  - The committed `e2e/security-headers` spec (4 cases) passed when run once as an exact copy with only the session helper pointed at the disposable project. In CI it runs against the standard local project on desktop and mobile.
- Tiptap's injected `<style>` is disabled; its base rules live in the editor CSS module (the gap-cursor blink animation is dropped).
- Not run locally: the full browser suite (its fixtures use the primary local project), concurrency and SQL suites (no SQL changed).

Remaining: production-origin header check, HSTS `includeSubDomains`/preload once the domain is final, and policy updates for any future embeds.
