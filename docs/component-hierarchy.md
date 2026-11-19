# Component hierarchy

Status: Editorial dashboard routes through Phase 4 are implemented; public article/archive/search and site composition remain Phase 5 work. See [integrated evidence](reviews/phase-4-editorial-workflow.md).

The existing draft edit page loads the current private main-image link server-side. `ArticleMedia` in `DraftForm` reserves and uploads a JPEG/PNG/WebP image, collects alt text and credit, then saves the link through a separate versioned mutation. It can update image metadata, unlink the current image, or discard an upload that was never attached. Unsaved draft fields disable image changes; unsaved image input participates in the navigation guard. The current main-image link is described as text; body-image previews use the authenticated media route. Public rendering remains Phase 5 work.

Task 4 adds a body-image control to the private editor. It reuses the checked upload protocol, inserts a canonical image block, edits or removes a selected block, and previews finalized WebP through an authenticated route. Uninserted uploads participate in the unsaved-navigation guard. A safe read-only body is server-rendered inside the no-JavaScript fallback. Video remains visibly unavailable pending provider approval; public rendering is Phase 5.

## Implemented foundation routes

| Route             | Behavior                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| `/`               | Accessible foundation homepage; final publication composition remains planned  |
| `/sign-in`        | Server action initiating Google sign-in; hosted provider setup remains manual  |
| `/auth/callback`  | PKCE code exchange and safe access routing                                     |
| `/access-pending` | "Access not approved" page and sign-out (person is not on the staff list)      |
| `/dashboard`      | Protected owned-article listing with pagination, role-aware shell and sign-out |

The header's public section links identify planned Phase 5 destinations. Dashboard profile and administrator routes are implemented. Both dashboard layout and page independently call the server membership guard. Components live in named folders under `src/frontend/components/site`, `src/frontend/components/dashboard`, and `src/frontend/components/ui`, alongside their owned CSS Modules and existing tests. See [file colocation](coding-style.md#file-colocation).

## Full MVP public route design

| Route                                               | Purpose                                    | Access                |
| --------------------------------------------------- | ------------------------------------------ | --------------------- |
| `/`                                                 | Lead, featured, and section-based homepage | Public                |
| `/articles/[slug]`                                  | Published article                          | Public when published |
| `/sections/[sectionSlug]`                           | Section archive                            | Public                |
| `/sections/[sectionSlug]/categories/[categorySlug]` | Category archive                           | Public                |
| `/tags/[slug]`                                      | Tag archive                                | Public                |
| `/authors/[slug]`                                   | Author biography and articles              | Public                |
| `/search`                                           | Published-content search                   | Public                |
| `/about`                                            | Mission, history, and staff information    | Public                |
| `/letters`                                          | Published Letter to the Editor archive     | Public                |
| `/letters/how-to-submit`                            | Submission instructions                    | Public                |
| `/sign-in`                                          | Google sign-in                             | Public                |
| Not-found boundary                                  | Search and return-home recovery            | Public                |

Newsletter signup is deferred.

## Full MVP dashboard route design

| Route                            | Purpose                                                                                             | Access         |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| `/dashboard`                     | Summary and My Articles                                                                             | Active members |
| `/dashboard/articles/new`        | Create article                                                                                      | Author/admin   |
| `/dashboard/articles/[id]`       | Edit owned or administrator-accessible article                                                      | Owner/admin    |
| `/dashboard/profile`             | Edit own public profile                                                                             | Author/admin   |
| `/dashboard/admin/articles`      | Manage all content and archives                                                                     | Admin          |
| `/dashboard/admin/articles/[id]` | Review article status and restore archives                                                          | Admin          |
| `/dashboard/admin/members`       | Staff list: counts by role, search and filters, add people by email, change role, deactivate/remove | Admin          |
| `/dashboard/admin/taxonomy`      | Manage sections and categories; view tags                                                           | Admin          |
| `/dashboard/admin/homepage`      | Curate lead, Featured News, and Read This                                                           | Admin          |
| `/dashboard/admin/site`          | Edit allowlisted site information                                                                   | Admin          |
| `/dashboard/admin/audit`         | Review audit activity                                                                               | Admin          |

Task 10's administrator contributor route was removed with the one-off credits change (2026-11-16): credits typed in the editor are the only way to credit someone without an account, and there is no contributor directory to administer.

Task 11 implements bounded administrator taxonomy catalogs and existing section/category controls. Tags are read-only pending normalization approval; names and navigation order can change without altering stored slugs or parent links.

Task 12 implements `/dashboard/profile` for the caller's own public name and biography, with generated-slug display, exact retry and explicit conflict reload. Profile image selection remains unavailable until a separate profile media contract exists.

Task 13 implements `/dashboard/admin/homepage` with a published-article catalog, ordered lead/Featured News/Read This controls, a saved fallback preview, exact retry and explicit conflict reload. Public homepage composition remains Phase 5 work.

## Source locations

Route composition remains in `src/app`. Feature-owned editor/forms/lists live in `src/frontend/features/<domain>/components/`, with article editor adapters and save-state helpers beside that domain's components. Public/dashboard shells and reusable controls live in `src/frontend/components/`. Components keep their owned styles and tests beside their implementation. These folders describe ownership; existing Server Components keep server rendering. See [architecture](architecture.md#repository-structure) for the full tree, backend/shared responsibilities, and an article-save walkthrough.

## Component tree

```text
RootLayout
├── PublicLayout
│   ├── SiteHeader
│   │   ├── Logo
│   │   ├── PrimaryNavigation
│   │   ├── ResponsiveMenu
│   │   └── SearchControl
│   ├── PublicPage
│   │   ├── HomeSections / ArchiveListing / ArticleView / StaticPage
│   │   ├── ArticleCard
│   │   └── Pagination
│   └── SiteFooter
├── AuthLayout
│   └── SignInCard
└── DashboardLayout
    ├── DashboardNavigation
    ├── MembershipGuard
    └── FeaturePage
        ├── ArticleEditor
        ├── ArticleTable
        ├── ProfileEditor
        └── AdminPanels
```

## Significant responsibilities

- `SiteHeader`: brand, navigation categories, accessible menus, and search entry.
- `HomeSections`: render administrator selections with deterministic recent-content fallbacks.
- `ArticleView`: render sanitized content, credits, taxonomy, biography, and related stories.
- `ArchiveListing`: shared paginated presentation for section, category, tag, author, letter, and search results.
- `ArticleEditor`: own form state and usability validation; authoritative validation remains server-side.
- `MembershipGuard`: improve routing experience but never replace server/RLS authorization.
- `AdminPanels`: focused interfaces for one administrative concern each.
- `SiteFooter`: render managed mission/contact/social/navigation content.

## State and data conventions

- Prefer server-rendered reads and server-owned authoritative state.
- Use local client state only for interaction, editor state, optimistic feedback, and unsaved form changes.
- URL query parameters own search terms, filters, and pagination where appropriate.
- Do not create a global client store without a demonstrated cross-route requirement.
- Every async surface provides loading, empty, error, success, and disabled states.
- Shared public components use semantic HTML, keyboard operation, visible focus, and responsive layouts.

## Implemented My Articles listing

Phase 3 Task 6 connects `/dashboard?cursor=<opaque cursor>` to the checked own-list query. Layout and page retain independent membership guards. Server-owned rows show title, status and UTC update time; Phase 4 Task 5 adds edit links for published rows while archived rows remain read-only. `ArticleList` owns its semantic list and CSS; `ArticlePageLink` owns client-navigation loading feedback; `ArticleListError` shares safe error presentation between server reads and the unexpected client-error boundary.

Initial reads and bounded read/input errors render fully on the server, including without JavaScript. Native next/newest/retry links preserve that behavior; client pagination additionally announces pending work without replacing initial HTML with a streaming loading fallback. The URL owns the cursor; no editor provider or global store is introduced.

Create links target the implemented `/dashboard/articles/new` form. Draft edit links target the implemented `/dashboard/articles/[id]` route; prefetch remains disabled. See [screenshots and verification](testing.md#phase-3-task-6-my-articles-listing).

## Implemented new-draft form

Task 7 implements `/dashboard/articles/new` with an independent membership guard and the checked options query. It starts with empty title/section, NULL optional metadata/body and empty associations. Phase 4 Task 2 removes the manual slug field; the database generates a slug from the title. With no active sections, it explains the missing catalog and disables creation rather than inventing taxonomy.

`DraftForm` owns submission/status/error focus and navigation; `DraftMetadataFields` owns controlled metadata and field styling; the colocated `use-draft-command` hook owns basic dirty/saving/error/retry state. Shared metadata feedback comes from the existing draft validator. The optional article/version prop is now consumed by the Task 8 edit route; the same form/controller serves both modes.

The client form starts disabled in server HTML and explains its JavaScript requirement, avoiding a default GET submission of private fields. Confirmed creation now opens its private edit route. Task 10 permits edits during saving/uncertainty and locks only a clean confirmed-create navigation transition; an uncertain attempt retains its original request UUID/payload/version even if a later retry loses access. Only confirmed success resolves that uncertainty. Initial definitive failures keep input editable and permit a new corrected command.

Full-document reload/close has a best-effort unload warning for dirty/pending work; same-document browser Back/Forward is not guaranteed blocked. Task 10 implements editable-in-flight state reduction, supported app-link/sign-out warnings, conflict review and multi-tab recovery; see the current recovery section below. See [form verification](testing.md#phase-3-task-7-new-draft-form).

## Implemented constrained body editor

Task 8 adds `DraftEditor`/`DraftToolbar` with owned CSS/tests and a small prospective-paste helper. `DraftForm` dynamically loads the editor with SSR disabled; Tiptap also uses `immediatelyRender:false`. Loading NULL presents an empty editing surface without converting the stored NULL or marking the form dirty. Successful creates open the edit route; confirmed edit saves retain the acknowledged version for subsequent saves.

The edit route independently guards membership and uses the checked snapshot query. Missing/cross-owner IDs share not-found; archived and unsupported legacy bodies expose no save controls. Phase 4 Task 5 adds published edits through a distinct save action with status-aware labels; draft-only image controls stay hidden. Phase 4 Task 6 adds `ArticleLifecycleControls` for publish/archive confirmation, exact uncertain retry, conflict reload and route refresh; controls pause during unsaved form or media work. Task 9 replaced the temporary unavailable-selection route gate with deliberate repair controls. Existing IDs remain visible with generic labels; unavailable section/category/tag/profile choices must be replaced or removed before saving.

Only paragraph, H2/H3, quote, ordered/bulleted list, hard break, bold, italic and safe links are enabled. Native format translation belongs to `draft-document/`; engine types remain inside that boundary and editor/toolbar components. Only plain-text clipboard payloads are accepted. HTML, files, other rich MIME types and drops are explicitly blocked before parsing; plain text becomes a bounded model whose full prospective body validates before dispatch. Invalid native edits block saving, expose associated body errors and retain best-effort unload protection.

## Implemented draft association selectors

`DraftTaxonomyFields` owns native category/tag checkbox groups; `DraftContributorFields` owns profile, writer/editor/creative role and integer display-order controls. Both are controlled by the existing DraftForm, with owned CSS/tests and no global state. They expose empty catalog, limits, unavailable selections and linked error feedback. Guest profiles and tied orders are supported; credits confer no edit permission.

The form's category-loading hook keeps initial server choices, loads choices after section changes, ignores stale responses and exposes a retry control. Selected category IDs are never automatically removed. Save is blocked while choices load/fail; exact uncertain write retries retain the original command. The edit route preserves unsupported/read-only guards while allowing deliberate association repair. Task 10 acknowledges the submitted canonical selections separately from newer input, avoiding false clean/dirty state after sorting or a delayed response.

## Implemented save and conflict recovery

The `draft-save-state/` reducer owns current/acknowledged input, committed identity/version, pending command and safe results. `use-draft-command` synchronously snapshots latest valid input before transport and blocks duplicate or conflicting commands. Inputs remain editable during saves/uncertainty; Retry original save sends its original payload/version/UUID, even when newer body or catalog input is invalid. Only a deliberate new save after resolution uses newer values. Create success with newer edits retains the resource on the mounted new-draft form until a later clean save can navigate safely.

`DraftConflictPanel` reviews latest authorized detail/options without replacing input. Explicit confirmation adopts an editable, non-stale version and its catalogs; current native editor errors reset only on this deliberate replacement. Focus returns to Title. Prior local metadata/selections and the last valid canonical body remain in a read-only reference panel for manual re-entry; unsupported native body edits are explicitly excluded from that reference. Failed/hidden/read-only/unsupported recovery leaves local input intact and does not offer an editable load. Plain-text body previews use React text, not HTML or raw editor JSON. No automatic merge or force-save path exists.

`DraftNavigationProvider` contains only leave-check registration. `GuardedDashboardLink` uses supported Next Link navigation callbacks; `DashboardSignOutForm` checks before submitting the existing server action. Form registration owns one best-effort unload listener for dirty, pending or invalid-native input and cleans up on unmount/clean acknowledgement. New-tab modifiers and same-page error/skip anchors retain normal behavior. Same-document browser Back/Forward is not guaranteed intercepted; no persistent/crash-recovery promise is made.

## Implemented administrator article management

`/dashboard/admin/articles` and `/dashboard/admin/articles/[id]` independently require active administrator access. `AdminArticleList` renders bounded safe summaries as responsive list cards with native status/title filters and filter-bound pagination. The detail route shows safe metadata and links editable articles to the existing private editor. Archived details use `ArticleLifecycleControls` for administrator restore with confirmation, exact uncertain retry, conflict reload and pending feedback. Loading, empty, safe error and denied states are explicit. These routes never render the article body.

`/dashboard/admin/audit` is linked from article management and independently checks the active administrator role. `AdminAudit` renders safe article event labels, actor display name, UTC time, and a link to the guarded article detail; native action filtering and keyset pagination work without JavaScript. Empty, invalid-filter, and denied states are explicit. Archived or later removed articles retain their history row even if the detail link has no current target.

Archived administrator article details expose a typed-confirmation deletion control. `/dashboard/admin/media-cleanup` shows bounded operational counts and permits an eligible administrator to retry cleanup; it never exposes object keys or credentials. Deleted article audit events and prior events display retained IDs without dead article links.

The `/dashboard/admin/site` route independently verifies administrator access and renders the site-information form with bounded plain-text fields, save confirmation, retry, conflict recovery, and unsaved-change protection. Public site and footer rendering remain planned for Phase 5.

## Phase 5 planning reference

The [public-reader task plan](superpowers/plans/2026-11-09-phase-five-public-reader.md) maps demo masthead/navigation, hero/Latest/Featured News, cards/archive chips, article presentation and footer into the current ownership structure. News is confirmed in primary navigation and category routes are section-scoped. The demo is a visual reference; current app taxonomy, authentication, canonical bodies and editorial workflow remain authoritative. Later owner screenshots refine the visual tasks. Reader components and public data operations remain proposed until their task is implemented.

## Reader card primitives (Phase 5 Task 7)

ReaderSurface supplies reader-scoped presentation without adding a main landmark or replacing the application shell. ArticleGrid arranges ArticleCard components; each card consumes the shared browser-safe PublicArticleCard type, links to canonical article/section paths, and uses StoryMeta for credited writers (falling back to the public owner) and UTC publication dates. Card headings default to h3 with an h2 option. Images use the authorized public media route directly, preserving the approved cache lifetime and displaying credits. ArticlePagination renders available native newer/older links; ReaderState distinguishes empty content from unavailable reads. Pagination/retry URLs are supplied by the owning server-rendered page. No client directive or stateful presentation dependency is required.

The runtime card validator remains in the backend listing boundary and its results are checked against the shared type. These primitives are not yet wired into the homepage or masthead; subsequent Phase 5 tasks own that integration.

## Public reader shell (Phase 5 Task 8)

The `(home)` and `(public)` route-group layouts supply footer reads to the shared `PublicReaderShell` server component under `src/app/_components/public-reader-shell/`. It loads session-independent navigation in parallel and passes checked data into ReaderSurface and one PublicShell. The homepage page, CSS and tests belong to `(home)` without changing `/`; other reader pages remain in `(public)`. Root layout still owns html/body; dashboard and auth route groups retain their own composition. Sign-in continues using one PublicShell without public-data loading.

SiteHeader provides the text masthead and member link. Its small ReaderNavigation client component highlights current paths and enhances native section/category disclosures; links and a GET `/search?q=` form exist in server-rendered HTML. Mobile navigation starts expanded without JavaScript and collapses after enhancement. Escape closes the nearest open disclosure and focuses its summary. Desktop summaries remain reachable if a menu was closed before a no-JavaScript resize. PublicShell owns exactly one focusable main/skip target.

SiteFooter displays only supplied mission/contact/Instagram, configured sections and submission navigation. Contact addresses are encoded into mailto URIs. Its typed Read This slot displays only supplied public cards. Header/footer show no invented taxonomy or policy copy when data is absent. Taxonomy, search and About destinations are implemented by their owning later tasks.

## Data-backed homepage (Phase 5 Task 10)

The public homepage composes HomeHero, HomeLatest, HomeFeatured and HomeSection from the checked Task 9 result. A publication h1 remains accessible; the hero, Latest and section headings use h2, with subordinate story titles at h3. Hero media uses the authorized image route with intrinsic dimensions, visible credit and eager/high-priority loading; lower cards remain lazy. Empty groups are omitted and a missing hero image produces text-only editorial presentation.

The `(home)` layout's Read This footer and page/metadata share `getPublicHomepageForRequest`, a React request-scoped cache of the no-store query. This deduplicates calls within a server render without retaining content across requests. The `(public)` layout uses `getPublicReadThis` for footer cards without loading full homepage composition. Neither layout loads protected/user data. A null lead does not imply an empty catalog: reserved Featured or Read This stories can leave no free lead, so remaining groups render independently. Unavailable reads show retry feedback, omit uncertain footer picks and mark the response noindex; empty results use the existing empty state.

## Canonical article-body renderer (Phase 5 Task 11)

ArticleBody owns semantic React rendering for validated gavel-draft v1/v2 documents. It uses the existing bounded canonical validator, then resolves all required media before rendering paragraphs, h2/h3, marks, safe links, lists, blockquotes, figures and captions. Unsupported data produces a fixed unavailable message; no stored HTML, attributes or raw JSON are spread into output. Shared code has no editor/Tiptap runtime dependency.

PublicArticleBody adapts checked public image IDs/dimensions into the public media route and applies reader-scoped prose typography. Missing/invalid descriptors fail the whole body rather than revealing a partial rendering. DraftReadOnlyBody is now a compatibility adapter supplying private preview routes, the existing read-only label and preview/empty messages; when no valid article ID is supplied it retains plain image descriptions. The public article route composes this adapter as described below.

## Public article page (Phase 5 Task 12)

`/articles/[slug]` resolves only the anonymous public projection, including for signed-in owners. Metadata and page share one request-scoped detail read. Missing, draft, archived and deleted projections call `notFound()` before streaming; no route loading boundary is added. Unsupported content and expected backend failures use a generic unavailable state with noindex metadata; unexpected errors have a route-owned retry boundary that never displays diagnostics.

ArticleHeader renders title/dek, UTC publication date and eager authorized main media with dimensions/credit. ArticleCredits separates ownership from writer/editor/creative attribution. PublicArticleBody renders the validated canonical body and lazy body media. ArticleContext adds section-scoped category links, tags, the public owner's biography, search and up to three related cards. Its backend helper reads at most four same-section candidates and, when needed, four recent candidates, excluding the current article and duplicates. Related failures leave the readable article intact. Components use explicit type-only imports of the validated projection; no backend runtime enters presentation.

The [Task 12 plan](superpowers/plans/2026-11-10-public-article-page.md) records verification and limits. Search and About destinations remain owned by later tasks; complete SEO metadata remains Task 20 work.

## Public section and category archives (Phase 5 Task 13)

`/sections/[sectionSlug]`, `/sections/[sectionSlug]/categories/[categorySlug]` and `/letters` use one checked archive resolver. It resolves active scope from the anonymous public catalog before requesting twelve bounded cards, preserving category parent disambiguation and scope-bound cursors. Metadata and page reuse request-local archive reads; the public layout now shares the same request-local navigation reader. No persistent cache or caller session is introduced.

ArchiveHeader owns breadcrumbs and the page h1; CategoryChips links active categories with section-scoped URLs and a current-scope marker. ArchiveGrid composes the existing first-page section hero, nonduplicated cards, empty/final states, native Older articles links and a Newest articles recovery link. Missing/inactive scopes return an owned real 404; invalid cursors and unavailable reads use generic noindex states. Route error boundaries offer retry without exposing diagnostics. No loading boundary flushes content before scope resolution.

The letters route resolves the configured active section by the approved `Letter to the Editor` label, case-insensitively, rather than guessing its database slug or adopting the demo's category. Missing configuration fails unavailable. Its submission-guidance link targets the future Task 19 page. The [Task 13 plan](superpowers/plans/2026-11-10-public-section-archives.md) records this configuration gate, validation and remaining human review.

## Public tag archives (Phase 5 Task 14)

`/tags/[slug]` uses the narrow anonymous tag resolver and existing public tag list scope. The shared archive context now has an explicit sectionless variant: ArchiveHeader retains Home/current-topic breadcrumbs, CategoryChips returns no controls, and ArchiveGrid renders cards without a section hero. Each story retains its actual section link across multi-section results. Existing section/category/letters behavior remains unchanged.

Metadata/page share request-local resolution, and shared route boundaries retain real missing-tag 404, generic errors and safe cursor recovery. Native links support article-to-tag discovery and pagination without JavaScript. The [Task 14 plan](superpowers/plans/2026-11-10-public-tag-archives.md) records validation, SQL authority and limits; no tag editor or new write boundary is introduced.

## Public author pages (Phase 5 Task 15)

`/authors/[slug]` combines the narrow public author resolver with the shared sectionless archive grid. ArchiveHeader owns the display-name h1; an optional server-rendered introduction slot renders AuthorBiography before cards or cursor-recovery feedback. Biography text is escaped with preserved line breaks and omitted when absent. The shared PublicAuthor DTO has presentation fields only. No profile-image placeholder or editor is added.

Existing writer/owner/contributor links now resolve to public biographies and deduplicated owned-or-credited published stories. Shared native pagination and safe error/not-found boundaries are retained. The [author interface](api-contracts.md#public-author-archive-resolution) owns projection/visibility rules; the [Task 15 plan](superpowers/plans/2026-11-10-public-author-pages.md) records verification and remaining human/media/SEO gates.

## Search and not-found recovery (Phase 5 Task 18)

The `/search` Server Component validates the query/cursor parameter shape and calls the checked anonymous search reader once. Static noindex metadata spends no search ticket. SearchResults owns prompt, invalid, empty/final, unavailable and bounded-throttle feedback, and composes existing cards/grid/pagination. Pagination explicitly disables prefetch to avoid spending quota before a reader follows a link; new form submissions omit cursors.

SearchForm supplies the labeled native GET query to navigation, results and recovery without client state. NotFoundRecovery is shared by resource boundaries; the unmatched-root fallback supplies one static ReaderSurface/PublicShell independent of the backend. Existing resource `notFound()` behavior remains unchanged; initial-HTML recovery for matched resource URLs is under investigation because of a reproduced upstream framework bug. See the [Task 18 plan](superpowers/plans/2026-11-10-search-page-and-recovery.md) for the reproduced framework behavior, checks and remaining human review.

## Public information pages (Phase 5 Task 19)

`/about` and `/letters/how-to-submit` reuse the checked request-cached public site reader. SiteInformationPage renders mission or submission instructions as escaped paragraphs, preserves single line breaks, and shows only configured contact/Instagram links. Missing primary copy has honest feedback and noindex metadata; unavailable reads have separate noindex/retry feedback. No client component, intake form, history/staff copy or new settings contract is introduced. The [Task 19 plan](superpowers/plans/2026-11-10-public-information-pages.md) records verification and unresolved production copy.

## Status changes during private conflict recovery

The mounted private form keeps its original draft/published save mode. If a reviewed editable snapshot has a different status, recovery does not adopt its fields or version: it retains local input, blocks stale-mode saves and offers an explicit full Reload article action. The existing dirty-input unload warning remains active. Same-status deliberate loads still preserve the previous local snapshot; unresolved writes remain ineligible for recovery. No publication or mutation authority changes.

## Canonical section-root links

Reader navigation, footer, story cards/heroes/headers, home section links and archive breadcrumbs/chips use the browser-safe `shared/reader/section-link` helper. The approved case-insensitive `Letter to the Editor` label maps section roots to `/letters`; other roots retain encoded section slugs. Category links stay `/sections/<section>/categories/<category>`, including letters categories. Existing routes, redirects, metadata policy and publication checks are unchanged.
