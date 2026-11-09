# Phase 5 Task 1 — public reader contract and UI map

Status: accepted product decisions and proposed implementation contract for Task 1 review. No public RPC, Storage grant, caching change or reader route is implemented by this document. Baseline: `b7aa564`, including Phase 4 and the merged [Phase 5 task plan](2026-11-09-phase-five-public-reader.md). Update the authoritative API/security/data docs when each operation is actually implemented.

## Approved decisions and scope

- News appears in primary navigation. Category routes use `/sections/[sectionSlug]/categories/[categorySlug]`; section and nested category pages share the same `[sectionSlug]` directory.
- Public pages show only currently published articles. Public lookups behave identically for anonymous visitors and signed-in authors/administrators; private preview and private queries stay independent.
- Article and contributor slugs are generated and become fixed after first publication. Published editing retains the public slug. Archived content is not public until restored.
- Homepage curation uses one lead, up to four Featured News and four Read This selections without an article repeated across those slots. Missing/archived picks use newest published fallback stories excluding already reserved/shown picks. Proposed Latest count is three and section rows four, based on the demo. Section rows may repeat a curated article; this does not duplicate a curation slot.
- Active public author profiles may render an empty current article list. An author archive includes published owned or credited articles once per article. Inactive membership alone does not retract previously published journalism.
- On 2026-11-09 the owner chose a shared database-wide search limit. Its shared capacity can be consumed by one source, temporarily throttling other readers; it is not a per-client fairness or DDoS guarantee. No new service is selected.
- Demo frontend is visual reference only. Its password step, draft preview, taxonomy reclassification, featured flags, newsletter, sample copy and policy text are not product decisions. Further screenshots remain pending and can refine presentation in Task 22.

## Reader data boundary

Public projections are narrow, bounded database operations using fixed search paths and explicit grants. They recheck `status = published` within the operation; frontend visibility and caller claims never establish authorization. Direct anonymous table access is not expanded to private article, history, receipt or membership tables. Anonymous and authenticated calls to the public operation return the same published projection; existing owner/admin operations retain their own scope.

Article detail by canonical slug returns only article ID/slug, title, optional excerpt and metadata description, publication timestamp, checked version 1/2 body, active public taxonomy names/slugs, a public owner name/slug/biography, and public credited-contributor names/slugs/roles, plus finalized live image descriptors required for rendering. The owner and contributor credits remain distinct; byline/author links use only their public profile slugs. Card results omit body, editor metadata, draft/private state, revisions, Auth linkage, actor identifiers, object keys and credentials. Unknown, draft, archived and deleted slugs have the same not-found result. Database/network failures use a generic unavailable result. Unsupported or malformed stored bodies never fall back to raw JSON/HTML; surface a safe unavailable result and exclude that error response from indexing.

Public server readers use a publishable/anonymous-key client without request cookies or service-role credentials. Responses are bounded and validated before rendering. Publication predicates and dependent associations should be read coherently; no cross-request global cache holds body or status. Unknown site settings stay unset, not demo placeholder text. Active taxonomy respects existing parent relationships and administrator configuration.

## Pagination and search

List pages propose a default of 12 and a maximum of 24 items; one extra row may determine continuation. Order is `published_at DESC, id DESC` with PostgreSQL timestamp precision. Opaque versioned cursors bind the complete scope/filter/query and are strictly validated; opacity is not authorization. Forged, oversized, malformed and cross-scope cursors produce safe validation results. Concurrent editorial changes may change later pages; no frozen multi-page snapshot is promised.

Search uses parameterized, bounded PostgreSQL-native queries over visible article title, excerpt/description, canonical body text/captions, public writer/owner names, section/category names and tags. Newest matching publications appear first; relevance scoring, live suggestions and external search providers are outside this initial contract. Task 17 finalizes indexed extraction, input/term bounds and query-plan budgets against representative synthetic data.

The initial proposed shared budget is 120 accepted search attempts per 60-second fixed window across all callers. The database operation owns the quota and rejects excess with a bounded `rate_limited` result and a nonnegative retry-after value; neither a caller-provided identity, IP, request count nor budget can bypass the shared limit. Invalid input is rejected cheaply before search. Implementers must test direct anonymous RPC calls as well as the GET route, concurrency around window boundaries and safe user-facing retry feedback. A shared global quota permits starvation and does not establish per-IP abuse prevention; operator monitoring and any trusted edge protection remain launch gates. Confirm the actual query timeout/cancellation and quota transaction behavior during Task 17: do not claim that a rolled-back or cancelled transaction consumed quota. If cancellation defeats the agreed resource bounds, record a concrete launch blocker rather than claiming the throttle is bypass-proof.

## Media, responses and metadata

Public media remains in the private `article-media` bucket. Only finalized assets currently referenced by a published article's main image or current body are eligible for public delivery; pending, uploading, deleting, unattached, draft-only, archived-only and revision-only assets remain private. A separate validated public delivery route uses the anonymous client and a narrow live-reference policy. Existing authenticated preview stays private. Paths/credentials are not exposed in DTOs and no public bucket, long-lived signed URL or new service-key permission is assumed.

Owner-approved revision (2026-11-09): public article pages, metadata and sitemaps continue to check visibility on each request without persistent caching. Successful published-image responses may be cached for up to 300 seconds in browsers and intermediaries. Origin image requests still check current publication and live references; after archive, deletion or reference removal, origin requests are denied, but a previously cached image may remain available for the remainder of its five-minute lifetime. Draft/private preview and error responses remain no-store. Already delivered or saved copies and requests in flight cannot be recalled.

The image policy must enforce a five-minute maximum across cache layers: use explicit 300-second freshness and revalidation after expiry, with no stale-while-revalidate or stale-if-error extension. A proxy must not restart the lifetime of an already cached upstream response. Test actual upstream Storage and app response headers, conditional requests, expiry and archive/reference changes. Existing objects with the observed 3,600-second lifetime need verified header migration or another verified compatibility strategy before public reads. Hosted CDN behavior remains a release check. This approval changes caching tolerance only; it does not authorize a new service or expanded service-key use.

Published detail has a real article response; missing/unpublished/deleted resources produce a real 404 with the same safe body. Query/Storage/invalid-body failures use a generic unavailable state and are not cached or indexed. Listing/filter inputs have bounded validation errors; search quota returns safe throttling and retry guidance. Final HTTP status/header mappings are specified by the owning task and verified end to end with the installed Next.js/Supabase versions. Public SEO canonical links use the confirmed paths and a validated site origin. Robots is not an access control.

## UI mapping and assets

The [Phase 5 plan](2026-11-09-phase-five-public-reader.md#demo-inventory-and-adaptation-map) maps the demo's masthead/navigation, hero and Latest, Featured News, section cards, archive chips, article typography and footer into the existing `src/frontend` ownership. The reference is static HTML/CSS/JS; adapt its patterns as small React components and colocated CSS Modules. Scope reader tokens so dashboard presentation remains stable. Native semantic links/forms, keyboard menu behavior, focus visibility, reduced motion and narrow viewport reflow are required. The current `PublicShell` owns the main landmark; Task 8 must avoid duplicate shells/main landmarks while preserving auth/dashboard composition.

Reference SHA-256 fingerprints, recorded 2026-11-09 from `/Users/dylandrozario/Desktop/work/testing/demo-gavel-frontend`:

| File             | SHA-256                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `index.html`     | `a6a9a477eee86ac46fea947e81a88b994e11ca9c804e2e5ca5ba9648f366cdf3` |
| `article.html`   | `78d31ef02679f6f6c12ce4ec4920af72e57b5c10a79cd8bcef7c43e98dc0b1c5` |
| `section.html`   | `28ea3be5e1bdd977ebc940ce779043c730816bd919b3b6e0d024dbba84d7df9d` |
| `styles.css`     | `84a487ffcfb77ed66ee312f9674a026522e4610385da2cac71cf5b44fe0008d1` |
| `gavel-logo.png` | `bca3352f594563ec203eb80c832c3b63c457a29a75898d48911a1277bf5d7cf4` |

Logo/font licensing and exact values remain to be checked in Task 7. The user will provide additional screenshots; Task 22 reconciles them without blocking independent backend work or assuming visual signoff. Site history, exact production copy/contact, initial News categories and the `Outside of BC` label remain open inputs. Existing MVP requirements for author profile images and approved video have no accepted media/provider contract; they require separate focused work or explicit owner deferral before an MVP-complete claim.

## Task order, safety and proof

Tasks 2–6 establish the public projections and private-bucket delivery boundary; Tasks 7–15 add reader components, homepage, article, archive and author pages; Tasks 16–18 add search; Tasks 19–21 cover information and discovery; Tasks 22–23 cover screenshots/accessibility and integrated verification. Each task has the files, focused subtasks, acceptance criteria and checks in the [master plan](2026-11-09-phase-five-public-reader.md). Reserve concrete migration/test filenames on the owning branch and review sensitive public grants before release.

Critical acceptance: direct anonymous and authenticated denials for draft/archive/private-only assets; no stale public content on a new server request after archive; preserved owner/admin private boundaries; bounded pagination/search with direct-call throttling; safe canonical renderer; keyboard/mobile/no-JavaScript coverage. Run fast focused checks during each slice and heavy database/concurrency/browser checks once before its PR. Owner monitors hosted CI. Human security/screen-reader review, real OAuth/provider/cron configuration, recovery exercises and unresolved content/assets remain explicit launch gates.

## Review and validation

A focused read-only contract review identified missing public owner/contributor slugs needed by byline links; the allowlist above now includes them. No other critical contradiction or privacy gap was reported. No database grants or application implementation were changed. Document links, task ordering, demo fingerprints and formatting are checked with the task PR; hosted CI is owner-monitored.
