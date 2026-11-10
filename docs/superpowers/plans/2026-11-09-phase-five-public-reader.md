# Phase 5 — public reader experience implementation plan

> Execution uses the existing task-by-task workflow and the executing-plans skill. This is a proposed plan, not implemented functionality. Keep one focused task record with decisions and verification when executing each task; do not generate a separate document for every layer.

**Goal:** Let anonymous readers discover, search and read published journalism through the approved Gavel routes and a reader interface informed by the demo frontend.

**Architecture:** Retain one Next.js/TypeScript application with Supabase PostgreSQL/Auth/private Storage. Add narrowly allowlisted public readers beside existing private operations; server-render public pages without caller sessions. Presentation follows frontend/backend/shared ownership. Keep editorial writes, versioning, receipts, history and cleanup authoritative in their existing database operations.

**Baseline:** Planning branch `docs/phase-five-public-reader`, based on merged main `d6b8575` after Phase 4 Task 16 / PR #48. Its local verification, corrected authorization predicates, intermittent desktop API failures, moderate development dependency advisory, human review and hosted/operational gates are recorded in [Phase 4 evidence](../../reviews/phase-4-editorial-workflow.md). Merging that PR is not evidence those remaining gates passed.

**Authoritative scope:** [Product requirements](../../product-requirements.md), [MVP design](../specs/2026-10-16-the-gavel-mvp-design.md), [architecture](../../architecture.md), [source ownership](../../coding-style.md), [design system](../../design-system.md), [API conventions](../../api-contracts.md), [security](../../security-and-permissions.md), and [testing](../../testing.md). This plan supplies execution order and proposed interfaces; Task 1 accepts the public-read contract before any new grant or public route is built.

## Decisions and boundaries

- Owner confirmed on 2026-11-09: include **News** in main navigation.
- Owner confirmed on 2026-11-09: category URLs are **`/sections/[sectionSlug]/categories/[categorySlug]`**, matching section-scoped category uniqueness. Replace the earlier proposed `/categories/[slug]`; no old public category implementation or redirect migration exists.
- Keep `/articles/[slug]`, `/sections/[slug]`, `/tags/[slug]`, `/authors/[slug]`, `/search`, `/about`, `/letters`, and `/letters/how-to-submit`. Slugs remain generated, noneditable and frozen after publication under Phase 4 rules.
- Use the demo as a visual/component reference. It does not authorize importing its authentication, database schema, taxonomy changes, article content, policies or editorial workflow.
- Later screenshots are expected. Reserve Task 22 for visual reconciliation; task plans identify affected components when screenshots arrive. Screenshots can refine UI without silently changing a settled API or permission contract.
- Existing canonical body versions 1/2 and safe link rules remain authoritative. Raw HTML, demo paragraph/Markdown parsing and unapproved video are not new reader formats.
- Public data must be identical for anonymous visitors and signed-in owners/admins. A public slug is never a private preview route.
- Public launch remains separate from this implementation phase. Real OAuth, human security/screen-reader review, hosted cleanup and alerts, backups/recovery, provider/asset approval and remaining MVP carryovers cannot be declared done by reader tests.

## Demo inventory and adaptation map

Reference inspected at `/Users/dylandrozario/Desktop/work/testing/demo-gavel-frontend`. It is static HTML/CSS/JavaScript, not an existing React component package. Record its file revision/hash when an implementation task starts; do not depend on this workstation path at build/runtime.

| Demo reference                                          | Useful elements                                                                                                | Planned application owner                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `home.js`                                 | Lead/hero, Latest list, Featured News band, section rows, empty/solo layouts                                   | `frontend/features/reader/components/home-*`                                                                                    |
| Shared header/footer markup; `script.js`                | Logo masthead, sticky section/category navigation, search entry, mobile menu, mission/contact/Read This footer | Existing `frontend/components/site/` shell/header/footer                                                                        |
| `styles.css`                                            | Editorial type hierarchy, blue/ink/paper roles, card grids, reading widths and responsive breakpoints          | Reader-scoped tokens and colocated CSS Modules; verify contrast/reflow before accepting exact values                            |
| `db.js` card/date helpers; `section.html`, `section.js` | Article cards, archive lead, category chips, breadcrumbs, grid and pagination placement                        | `frontend/features/reader/components/article-card`, `archive-*`, `pagination`                                                   |
| `article.html`, `article.js`                            | Title/dek/byline/date, main image/credit, taxonomy links, reading column and “More in section”                 | `frontend/features/reader/components/article-*`; canonical document renderer                                                    |
| `about.html`, `404.html`                                | Prose-page layout, search/home recovery                                                                        | About/instructions/not-found presentation                                                                                       |
| Demo logo/icons/fonts/images                            | Candidate brand assets and typography                                                                          | Inspect provenance/licensing and approve local assets in Task 7; do not copy sample journalism or assume all images are cleared |

Important differences: demo Allston–Brighton and letters are categories; approved app models them as sections/standalone routes. Demo featured flags/2-item Read This differ from the approved one lead, up to four Featured News and up to four Read This slots with no repeated article across those slots. Demo sign-in adds a username/password step, author pages can preview drafts, article bodies use a simple text parser, and it includes newsletter/policy links. None of those behaviors are adopted here. Use the existing Google/membership dashboard, published-only public routes and canonical bodies. Policy pages/newsletter remain outside this plan unless separately approved.

## Proposed read and visibility contract (settled in Task 1)

- Add bounded public read RPCs/views chosen after inspecting actual grants. Prefer explicit allowlisted projection functions with pinned search paths over new broad table SELECT grants. Public schemas return only required published article fields, active taxonomy, public credits/profiles and approved site fields; no Auth links, membership data, actor IDs, receipts, revisions, draft bodies, raw storage paths or service credentials.
- `PublicArticle` supplies title/slug, excerpt, canonical body, publication time, public taxonomy/credits, owner biography and live image descriptors. `PublicArticleCard` omits body and administrative fields. Failures distinguish a generic unavailable service from a missing/unpublished resource without exposing private existence.
- A dedicated server-only anonymous-key reader never imports cookies/session guards or the service-role client. Existing owner/admin reads remain independent. Test the same public lookup while signed out and while an owner/admin is signed in.
- Listing inputs are allowlisted filter IDs/slugs, an opaque filter-bound cursor, and a bounded limit (proposed default 12, max 24). Default ordering is `published_at DESC, id DESC`; retain database timestamp precision. Invalid/oversized/foreign-scope cursors fail safely. No offset/full-table browser fetch.
- Preserve current private media routes. Public media stays in the private bucket with a new narrow published-live-reference policy and a separate public GET route; never publish the bucket, mint long-lived signed URLs, or expand service-key use for reader traffic. Live main/body references qualify; references held only by a private draft, archive or old revision do not.
- Start public responses with request-time reads and no persistent application/CDN/browser caching, including media and generated SEO output. Archival must hide content on the next request after commit. Already delivered content cannot be recalled. Task 1 verifies headers/framework behavior for the installed version; performance work cannot introduce a stale-content window without an explicit invalidation contract and race tests.
- Initial homepage presentation counts proposed from the demo: Latest 3, section rows 4. Approved curation limits remain 1/4/4; duplication prohibition applies to those curation slots. Task 1 confirms treatment of repeats in section rows before implementing composition.
- Active public author profiles may have an empty current article list; author archives include owned **or** credited published articles, deduplicated. Public identity fields never include Auth/membership linkage. Membership deactivation alone does not unpublish retained journalism.
- Search covers published title, descriptions/excerpt, canonical body text, writer/owner names, sections, categories and tags. Propose PostgreSQL-native bounded text search, newest matching articles first, with a GET form. Task 1 must select the required search rate-limit boundary and retry contract, including direct anonymous Supabase calls; an app-only throttle is insufficient if the same expensive RPC is callable directly. Relevance ranking, live suggestions and external search services are not assumed.

## Design risks and proof assignments

1. **Private data in public responses:** Tasks 2–6 test draft/archived/foreign/retired media and forged fields through real anon/authenticated calls, not browser hiding. Final public reads never inherit administrator visibility.
2. **Publication changes during reads:** Tasks 2/3/5/9/17 use coherent database snapshots, authoritative published predicates and post-transition reads. Tasks 6/20/21 test headers and alternate media/metadata/sitemap paths; archive/restore and published edits must not leak stale variants.
3. **Unsafe or unsupported content:** Task 11 validates before rendering, preserves supported legacy bodies, escapes text and rejects unsupported nodes/unsafe links. Public output never falls back to raw JSON/HTML. Task 12 distinguishes unavailable content from unpublished/missing resources with safe status handling.
4. **Pagination/search drift:** Tasks 3/13–18 test equal timestamps, duplicate credits/joins, concurrent archive/publish, empty final pages, filter changes, bounded hostile queries and query plans on synthetic volume. Do not promise a frozen multi-page snapshot across later editorial changes.
5. **Demo/screenshots diverge from app contracts:** Tasks 1/7/8/22 map components and assets explicitly, preserve the approved taxonomy and curation, and check mobile/keyboard behavior. No fabricated site text, history, categories or unapproved forms/links.
6. **Anonymous search abuse:** Tasks 1/17/18 assign enforcement, safe throttled responses/retry behavior and direct-RPC bypass tests. Do not trust a caller-supplied identity/IP/budget or assume Vercel-only throttling covers a public Supabase RPC. If a platform restriction prevents the accepted protection, record it as a specific launch blocker rather than declaring search complete.

## Execution rules

Each numbered task is one reviewable deliverable/PR. Its bullets are ordered subtasks. Commit database boundary/tests before its adapter/UI when both exist; split again if either slice becomes large. Aim for meaningful commits of a few hundred changed lines. Reserve exact new migration/test filenames against main when starting the owning task, not now. Do not edit applied migrations or reset existing local projects.

Run focused tests and fast checks while implementing. Run a task's heavy SQL/concurrency/browser gate once before its PR, then rerun only affected checks after fixes. Review each completed slice once. Use synthetic content and real role/ownership denials; do not weaken tests to make demos fit. Keep authorization/compatibility comments beside subtle code. Update authoritative docs only for changed lasting contracts; otherwise append decisions/results to the focused task record. Hosted CI monitoring remains with the owner.

## Task 1 — accept the public contract and UI map: ready for review

The [focused Task 1 contract](2026-11-09-phase-five-reader-contract.md) records the owner's News, category-URL and shared search-limit decisions; exact public visibility, role-independent reads, cursor/order bounds, fresh page checks, five-minute public-image caching and media authorization constraints; demo file fingerprints; and remaining asset/copy/screenshot gates. The 120-per-minute shared budget is an initial technical default, not an owner-selected number; Task 17 must measure capacity, cover cancellation/rollback limits, and retain direct-RPC enforcement before public release.

- [x] Inspect merged main and Phase 4 outstanding gates; fingerprint the demo and map reader components/routes.
- [x] Record visibility, public DTO fields, response/error constraints, pagination/search limits, rate-limit authority and retry, curation/row duplication, caching and canonical routes.
- [x] Record candidate logo/fonts, missing content/taxonomy and incoming screenshots as task/launch gates; no fake content or extra public access is introduced.
- [x] Validate links and task ordering and obtain focused contract review. Public grants and implementation remain in subsequent tasks.

**Acceptance/validation:** Product decisions reflect the owner’s answers; technical defaults and outstanding tests are explicit. The document is reviewable before any application code, database grant or route changes.

## Task 2 — public article-detail projection

**Files:** New migration/SQL tests; `src/shared/reader/article-contract/`; `src/backend/reader/article-query/`; `src/backend/infrastructure/supabase/public-reader/` with colocated tests.

- [ ] Define/check a body-bearing allowlisted article DTO and minimal anonymous reader client; assert it cannot use a cookie session or service key.
- [ ] Implement exact-slug published-only detail, embedded taxonomy/credits/main/body image descriptors and safe missing/unavailable results in one coherent read.
- [ ] Prove draft/archive/unknown slugs are indistinguishable; direct anon/authenticated calls return no protected fields and do not widen private RLS. Invalid legacy content never enters raw public output.

**Acceptance/validation:** Safe DTO or safe failure for every role; SQL denials, adapter/unit checks, schema lint and type drift pass. First commit database contract/tests, then checked server adapter.

## Task 3 — bounded public listing projection

**Files:** New migration/SQL tests; `src/shared/reader/list-contract/`; `src/backend/reader/article-list/` and tests.

- [ ] Implement summary-only published listings for latest, section, section/category, tag and author scopes using the Task 1 limit/order contract.
- [ ] Bind continuation cursors to scope/filter/version; deduplicate joins and preserve timestamp precision. Return continuation without loading all articles or demanding an unbounded total count.
- [ ] Test duplicate credits/tags, equal timestamps, malformed/oversized cursors, concurrent publication changes and no draft/body leakage. Inspect query plans and add only demonstrated indexes.

**Acceptance/validation:** One checked list contract supports subsequent archive tasks with stable bounded pages. SQL, cursor/unit, query-plan and generated-type checks pass.

## Task 4 — public navigation and site-information projection

**Files:** New migration/SQL tests; `src/shared/reader/site-contract/`; `src/backend/reader/site-query/` and tests. Reuse existing taxonomy/site fields.

- [ ] Return active sections/categories in configured order and approved mission/contact/Instagram/submission plain text only.
- [ ] Keep private settings records, versions, audit/receipts and inactive taxonomy hidden. Render unset values as absent; validate public links at the checked boundary.
- [ ] Test direct anon/authenticated results, inactive parents, empty catalogs/settings and unsafe stored links without changing administrator write signatures.

**Acceptance/validation:** A session-independent, bounded public shell data contract; SQL denials and server validation tests pass.

## Task 5 — published-media database authorization

**Files:** New migration/SQL tests for `article-media` policy and private visibility helper; no new bucket or image pipeline.

- [ ] Define exactly which finalized assets are currently referenced as main/body media by a published article.
- [ ] Permit only the necessary public Storage read operations for those keys; keep listing, writes and private-only metadata/media paths closed. Preserve existing owner/admin access.
- [ ] Prove guessed draft/archived/deleting/unattached/revision-only assets fail, including a formerly published image removed from the live body. Exercise archive/restore/reference-change races and helper grants. Verify direct Storage network requests and upstream cache/authorization headers as well as the app proxy; do not assume a private bucket alone settles cache revocation.

**Acceptance/validation:** Public delivery is possible only for live published references; private Storage never becomes a public bucket. SQL/independent-session checks and security review pass before delivery UI. If existing object headers or upstream caching exceed the approved five-minute public-image lifetime, settle a concrete Storage-API compatibility/backfill approach in this task before granting reads; do not silently extend service-key scope or weaken the visibility contract.

## Task 6 — public media delivery route

**Files:** `src/app/api/public/articles/[articleId]/media/[assetId]/route.ts` and tests; `src/backend/reader/media-query/`; typed media descriptors as needed.

- [ ] Validate both IDs and authorize through the published projection and anonymous Storage policy. Never accept a caller URL/object path or use a service credential.
- [ ] Stream validated WebP with correct type/nosniff and the approved five-minute public-image cache policy (private previews and errors remain no-store). Avoid image-optimizer/CDN derivatives that extend the approved five-minute removal window.
- [ ] Test GET/HEAD as applicable, missing/invalid assets, service failures, cross-article substitution and archive-after-visit. Existing private preview routes must retain their behavior.

**Acceptance/validation:** Published images load while private/retired variants remain unavailable; route/unit and real Storage/browser header checks pass.

## Task 7 — reader tokens, assets and article-card primitives

**Files:** Reader CSS/token module; `src/frontend/features/reader/components/article-card/`, `story-meta/`, `pagination/`, `reader-states/`; approved local branding assets.

- [ ] Translate demo typography, colors, spacing and grids into semantic, reader-scoped tokens after asset/license inspection. Protect existing dashboard tokens/styles.
- [ ] Build a small server-renderable card/meta/pagination set from checked DTOs, with real links, stable image dimensions and honest missing-image/empty/error states.
- [ ] Check keyboard focus, contrast, narrow/long titles, absent images, reduced motion and mobile reflow. Record provisional visual choices awaiting screenshots.

**Acceptance/validation:** Reusable semantic presentation without fake article data, global CSS leakage or a new component dependency. Component/type/lint checks and one responsive browser fixture pass.

## Task 8 — public masthead, navigation and footer

**Files:** Existing `src/frontend/components/site/` modules; proposed `src/app/(public)/layout.tsx`; move root homepage plus owned files into that route group without changing `/`. Keep dashboard/auth composition intact.

- [ ] Port demo masthead/logo and section/category navigation with News, section-scoped category links and an accessible mobile menu. Add a native GET search form/entry.
- [ ] Render mission/contact/Instagram/navigation footer data from Task 4. Give Read This a typed slot, filled by Task 10; unknown copy/links stay absent.
- [ ] Preserve one main landmark/skip target, active navigation, Escape/focus behavior and no-JavaScript links. Isolate public data loading from protected layouts and avoid duplicate shells on sign-in pages.

**Acceptance/validation:** Shared reader shell works at desktop/mobile widths without altering dashboard auth or adding newsletter/desk-password features. Route/component and keyboard/browser checks pass.

## Task 9 — public homepage composition query

**Files:** New migration/SQL tests; `src/backend/reader/homepage-query/`; `src/shared/reader/homepage-contract/`. Reuse or narrowly extract existing curation selection logic.

- [ ] Resolve one lead, up to four Featured News and four Read This from saved selections plus newest published fallbacks, with the approved cross-slot deduplication.
- [ ] Return public card DTOs plus bounded Latest/active-section groups in a coherent snapshot. Do not expose saved archived picks, admin versions or the admin curation RPC to anonymous readers.
- [ ] Test ties, too few/no articles, repeated/archived selections and archive/restore during composition. Preserve the admin preview/saved-state contract.

**Acceptance/validation:** Public composition matches approved curation rules and never leaks private picks. SQL, curation parity, concurrency and adapter tests pass.

## Task 10 — homepage reader sections

**Files:** `src/app/(public)/page.tsx`; `src/frontend/features/reader/components/home-hero/`, `home-latest/`, `home-featured/`, `home-section/`; footer Read This adapter.

- [ ] Assemble Task 9 data into demo-inspired hero/Latest, Featured News band and section rows using shared cards.
- [ ] Handle no content, single-story hero, partial groups, missing media and unavailable service distinctly; use route links and the same effective Read This selections in the footer.
- [ ] Verify curation edits, published edits and archive/restore change the next public request. Keep fetches bounded rather than querying per card.

**Acceptance/validation:** Data-backed homepage at desktop/mobile widths and without JavaScript; component/browser checks plus curation-to-home regression pass. Exact screenshot matching remains Task 22.

## Task 11 — safe canonical article-body renderer

**Files:** `src/frontend/components/article-body/` (pure renderer if shared); public/private adapters in their frontend domains; existing canonical validator and private read-only renderer tests.

- [ ] Reuse canonical version 1/2 validation; extract only presentation that both private and public views genuinely need. Inject the appropriate checked media descriptors/resolver instead of hardcoding the private preview URL.
- [ ] Render supported headings/text/marks/lists/quotes/images/captions with safe semantic React output. Reject unsupported content and unsafe links without HTML/JSON fallback or demo Markdown conversion.
- [ ] Test supported legacy bodies, malicious attributes/protocols, unknown nodes, missing media and bounded deep/large input. Keep existing dashboard/private rendering regression coverage.

**Acceptance/validation:** Reader needs no Tiptap/editor bundle and cannot execute stored content. Renderer/security/component and existing editor/parity checks pass.

## Task 12 — public article page

Implemented on `feat/public-article-page`; see the [focused plan and verification](2026-11-10-public-article-page.md). Integration into main and human visual/accessibility approval remain separate gates.

**Files:** `src/app/(public)/articles/[slug]/page.tsx`, owned loading/error/not-found boundaries; `src/frontend/features/reader/components/article-header/`, `article-credits/`, `article-context/`.

- [ ] Compose title/dek, owner/writer/other credits, publication date, main image/credit, body, taxonomy and author biography from checked detail data.
- [ ] Add bounded recent/same-section related links and search entry using existing public readers; exclude the current article. Preserve public identity and publication time after edits.
- [ ] Test anonymous and signed-in users see the same published result; draft/archived/deleted slugs never preview. Invalid stored content has a safe unavailable state and private existence is not disclosed.

**Acceptance/validation:** Fully server-rendered article/related content works without JavaScript, with safe error/404 distinction and responsive reading layout. Route/security/browser checks pass.

## Task 13 — section, category and letters archives

Implemented on `feat/public-section-archives`; see the [focused plan and verification](2026-11-10-public-section-archives.md). Main integration, real letters configuration and human visual/accessibility approval remain separate gates.

**Files:** `src/app/(public)/sections/[sectionSlug]/page.tsx`, `sections/[sectionSlug]/categories/[categorySlug]/page.tsx`, `letters/page.tsx`; `frontend/features/reader/components/archive-header/`, `archive-grid/`, `category-chips/`.

- [x] Resolve active catalog scope and compose the shared bounded list with section lead, category chips/breadcrumbs and native next-page links.
- [x] Use one `sections/[sectionSlug]/` directory for both section and nested category routes; differently named sibling dynamic segments are invalid. Build `/letters` as the approved Letter to the Editor section archive and link submission guidance. Do not reclassify it or Allston–Brighton to match the demo.
- [x] Test equal category slugs in different sections, inactive/missing parents, empty/final pages and cursor reuse across scopes. Missing real taxonomy remains a configuration/input gate, not invented seed data.

**Acceptance/validation:** All three route shapes reuse the same tested listing contract and preserve category disambiguation. SQL/route and focused desktop/mobile checks pass; keep each thin route in a separate commit if needed.

## Task 14 — topic-tag archives

Implemented on `feat/public-tag-archives`; see the [focused plan and verification](2026-11-10-public-tag-archives.md). Main integration and human visual/accessibility approval remain separate gates.

**Files:** `src/app/(public)/tags/[slug]/page.tsx` and tests; shared archive components/reader scope.

- [x] Resolve an existing tag and list only matching published articles, including multi-section results and taxonomy links.
- [x] Test duplicate joins, inactive/missing associations, no results and pagination isolation. No tag creation/normalization UI or new write grant is added.

**Acceptance/validation:** Tag links from articles lead to correct bounded public lists; route/unit and browser checks pass.

## Task 15 — public author projection and page

Implemented on `feat/public-author-pages`; see the [focused plan and verification](2026-11-10-public-author-pages.md). Existing anonymous profile policy supports the narrow application projection without a migration. Main integration, human review and unresolved profile media remain separate gates.

**Files:** New narrow profile-reader SQL/tests where necessary; `src/backend/reader/author-query/`; `src/shared/reader/author-contract/`; `src/app/(public)/authors/[slug]/page.tsx` and owned components/tests.

- [x] Return only approved active public profile fields. Keep public names/bios independent of membership/Auth details and never join those fields into reader DTOs.
- [x] List owned or credited published articles once per article using Task 3's author scope; support guests, multiple roles and empty current archives. Preserve frozen author URLs.
- [x] Test inactive/missing profiles, credited non-owners, deactivated memberships with retained published journalism and private-article exclusion. Profile images remain explicitly gated by the unresolved media contract.

**Acceptance/validation:** Correct public biography/byline links and deduplicated author articles with no identity linkage leak. Commit projection/tests, then thin route/presentation; SQL/unit/browser checks pass.

## Task 16 — searchable published-text extraction and indexes

**Files:** New additive migration/SQL tests; private canonical-body text extractor/index helpers as needed. No external search service or browser article download.

- [ ] Specify text extraction from supported canonical text nodes/captions; do not index arbitrary JSON keys, asset identifiers, hidden revision data or unknown legacy blobs.
- [ ] Choose PostgreSQL-native search/index paths for article text and current public writer/taxonomy names. Avoid denormalized joined fields unless every rename/association/publication change has a tested refresh path.
- [ ] Prove upgrade preservation and live edit/archive/restore/name-change behavior; measure representative query plans and bound query work.

**Acceptance/validation:** Searchable data remains published-only at query time with no stale private-content index exposure. SQL/extractor/query-plan and schema checks pass; this task exposes no public search endpoint yet.

## Task 17 — bounded public search query

**Files:** New read-operation migration/tests; `src/backend/reader/search-query/`; `src/shared/reader/search-contract/`.

- [ ] Implement Task 1's bounded natural-language query over title, descriptions, body, writers, sections, categories and tags. Return cards and filter-bound continuation only.
- [ ] Parameterize input; normalize whitespace and bound length/terms/page size. Treat quotes, wildcard-like text and hostile strings as data under the accepted search grammar. Implement Task 1's rate-limit boundary and bounded safe throttled result, including direct-RPC protection; no new provider is assumed.
- [ ] Test all required match fields, duplicate authors/joins, missing results, invalid cursors, rename/edit/archive/restore and direct anon/authenticated parity. Verify no snippet exposes private/HTML content. Exercise bursts, forged quota/identity inputs and direct anonymous calls to prove the selected rate limit cannot be bypassed through another entry point.

**Acceptance/validation:** Published-only search works through the anonymous reader with predictable bounded ordering. SQL/security/unit and relevant concurrency checks pass.

## Task 18 — search page and custom not-found recovery

**Files:** `src/app/(public)/search/page.tsx`; appropriate app/public not-found boundaries; reader search/results components and shared search form.

- [ ] Use native GET `q` submission, a persistent label, meaningful query/result/empty/error/throttled states with the accepted retry behavior, and accessible pagination. Work without JavaScript.
- [ ] Build demo-informed custom 404 recovery with search and a home link; unknown slugs remain real 404s rather than redirects or soft-200 placeholders.
- [ ] Test keyboard/mobile use, query retention/escaping, changed-query cursors, no-result terms and private/deleted article URLs. Live suggestions are not required.

**Acceptance/validation:** Search and recovery share existing primitives; no client full-corpus search or invented endpoint. Route/component/browser checks pass.

## Task 19 — About and submission instructions

**Files:** `src/app/(public)/about/page.tsx`, `letters/how-to-submit/page.tsx`; reader prose component; public settings reader tests if needed.

- [ ] Render mission and submission instructions as escaped plain text with paragraph breaks from approved settings. Show contact/Instagram only when valid and configured.
- [ ] Add history/staff sections only when approved source content exists; demo “Est. 2009”, mission, Gmail address and policy wording are references, not authorization to publish copy.
- [ ] Test unset content, long paragraphs, safe mail/social links and no-JavaScript rendering. Do not add submission forms, newsletter signup or legal/policy pages without separate scope approval.

**Acceptance/validation:** Informational routes are useful and honest with missing inputs; component/route and focused browser checks pass. Unprovided publication copy is a pre-launch input gate.

## Task 20 — public page metadata and canonical identity

**Files:** Public route metadata helpers; `src/backend/reader/metadata-query/` only if existing detail/list readers cannot supply it; private/auth metadata settings; relevant tests.

- [ ] Produce title/description/canonical/social metadata from the same published read used by the page. Reuse within a request without adding persistent stale caches or an unrestricted metadata reader.
- [ ] Preserve article/author URL freezes, canonical section-scoped categories and safe plain-text previews. Keep private/auth/search variants appropriately excluded from indexing per Task 1.
- [ ] Test archive/deletion between visits, malformed canonical inputs, absent media, legacy unsupported bodies and signed-in public requests. Public metadata must not become a draft preview side channel.

**Acceptance/validation:** Correct initial server HTML and headers for indexable pages and safe noindex/error handling elsewhere. Metadata/route/header and production-build checks pass.

## Task 21 — sitemap and robots

**Files:** Framework sitemap/robots entry points; a bounded public sitemap reader if needed; SQL/route tests and deployment docs for final origin.

- [ ] Enumerate only public eligible URLs using bounded database pages; exclude dashboard/auth, private statuses and noncanonical/invalid routes. Do not load every article/body into one query.
- [ ] Use validated `SITE_URL`; split sitemap output when required by actual dataset/protocol limits. Keep previews protected and excluded from indexing; robots is not authorization.
- [ ] Test pagination scale, duplicates, archive/deletion removal, unpublished authors/taxonomy according to Task 1, and sitemap failures without leaking internal data.

**Acceptance/validation:** Sitemap/robots agree with route visibility and fresh publication state; SQL/route/header and build checks pass.

## Task 22 — screenshot reconciliation and reader accessibility

**Files:** Only affected reader components/CSS, public route states, design-system notes and focused browser tests.

- [ ] Compare owner-provided screenshots and the inspected demo against implemented reader pages; record which screenshots cover desktop/mobile and which details remain unconfirmed.
- [ ] Make small component-level adjustments to hierarchy, spacing, crop, typography, navigation and sidebars; preserve semantic structure and settled contracts. Do not rebuild whole pages to match one screenshot.
- [ ] Verify keyboard/focus, mobile/zoom/reflow, contrast, reduced motion, long real-shaped content, image alt/captions and all loading/empty/error/404 states. Request human screen-reader review separately.

**Acceptance/validation:** Approved visual differences are resolved in small commits, with targeted component/browser checks. Capture screenshots only when needed for visual comparison/reviewer evidence. If inputs are still missing, record visual signoff as pending rather than blocking independent backend tasks or claiming a match.

## Task 23 — integrated public-reader verification and handoff

**Files:** One focused Phase 5 evidence/task record; this plan, README/index and affected authoritative docs. Only demonstrated defect fixes enter product code.

- [ ] Verify populated upgrade and clean install in a disposable project, full SQL/public/private role denials, generated types/schema, unit/contract/editor/concurrency, production build and reader-plus-dashboard browser journeys.
- [ ] Exercise publish/edit/archive/restore/delete across detail/list/search/homepage/author/media/metadata/sitemap paths and header/cache variants. Include anonymous and signed-in public requests; no private preview is allowed.
- [ ] Obtain fresh whole-slice code/security review, resolve reproduced blockers and record automated versus human accessibility/performance evidence. Record actual command/head/results and owner-run hosted check link; do not monitor CI for the owner.
- [ ] Reconcile final screenshots, remaining copy/taxonomy/assets/providers/profile-image inputs and operational launch gates. Publish a concrete implemented/pending handoff; do not call the entire MVP deployable while required work or verification remains.

**Acceptance/validation:** Traceable public-reader evidence matches the final source; Phase 4 private invariants are preserved. Hosted/human/operational and owner-decision gates are named explicitly, with no invented approval.

## Dependency order and release boundaries

`1 contract` precedes all grants/UI work. `2 detail` and `3 lists` establish read contracts; `4 shell data`, `5 media policy`, `6 delivery` follow those contracts. `7 primitives` can proceed once Task 1 settles the UI map, then `8 shell`. `9 composition` plus `10 homepage`, `11 body` plus `12 article`, and `13–15 archives/authors` reuse those foundations. `16 extraction` precedes `17 search query` and `18 search UI`. `19 prose`, `20 metadata`, `21 discovery`, `22 screenshots/accessibility`, then `23 verification` finish the phase. Parallel work is optional only where file ownership/dependencies are independent; do not combine these into one broad PR.

Each task branch starts from the latest accepted main and preserves pending work. New public grants stay unavailable until its Task 1 contract/security review is accepted. Scope public media and data exposure together before releasing reader pages. Keep buildable preview checkpoints after the article route, homepage/archives and search/SEO. Unfinished route links must be tracked until their owning task lands; preview checkpoints are not public launch approval and do not replace final acceptance.

## Remaining MVP and launch gates

Profile-image upload/editing and approved video are existing product requirements with unresolved contracts, not implicitly removed from MVP by this reader plan. Task 1 must assign them focused follow-up work or obtain an explicit owner deferral before an MVP-complete claim. No new service/provider is chosen here. News category inputs and the protected `Outside of BC` label, real publication history/contact/mission/submission copy, approved branding/fonts, privacy/ethics wording if later requested, and remaining screenshots require owner input where not already configured.

Real hosted Google/session behavior, environment separation, cleanup credentials/health/capacity/alerts, human security/screen-reader review, dependency remediation decisions, backup restore and release/rollback exercises remain operational work. Planning and local reader tests do not deploy the application or satisfy those gates.

## Planning review and validation

A read-only plan review checked the actual repository/demo, scope, task boundaries and privacy risks. It identified conflicting section dynamic-folder names and missing search rate-limit enforcement across direct RPC access. Both are addressed above. Document links, task numbering (1–23), whitespace and formatting were checked; no application code or migrations were changed and no runtime suite was needed. This review is not approval of an unimplemented public API or a completed visual design.
