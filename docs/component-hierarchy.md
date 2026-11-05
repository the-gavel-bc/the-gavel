# Component hierarchy

Status: Foundation shell, access routes and private My Articles listing, create form, constrained draft edit route and private draft main-image control implemented; publication and other dashboard feature routes below remain planned.

The existing draft edit page loads the current private main-image link server-side. `ArticleMedia` in `DraftForm` reserves and uploads a JPEG/PNG/WebP image, collects alt text and credit, then saves the link through a separate versioned mutation. It can update image metadata, unlink the current image, or discard an upload that was never attached. Unsaved draft fields disable image changes; unsaved image input participates in the navigation guard. The current linked image is described as text until the private preview and public rendering work lands.

Task 4 adds a body-image control to the private editor. It reuses the checked upload protocol, inserts a canonical image block, edits or removes a selected block, and previews finalized WebP through an authenticated route. Uninserted uploads participate in the unsaved-navigation guard. A safe read-only body is server-rendered inside the no-JavaScript fallback. Video remains visibly unavailable pending provider approval; public rendering is Phase 5.

## Implemented foundation routes

| Route             | Behavior                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| `/`               | Accessible foundation homepage; final publication composition remains planned  |
| `/sign-in`        | Server action initiating Google sign-in; hosted provider setup remains manual  |
| `/auth/callback`  | PKCE code exchange and safe access routing                                     |
| `/access-pending` | Denied/pending membership experience and sign-out                              |
| `/dashboard`      | Protected owned-article listing with pagination, role-aware shell and sign-out |

The header's section links and dashboard profile/administration links identify future destinations; those feature routes are not implemented. Both dashboard layout and page independently call the server membership guard. Components live in named folders under `src/components/site`, `src/components/dashboard`, and `src/components/ui`, alongside their owned CSS Modules and existing tests. See [file colocation](coding-style.md#file-colocation).

## Full MVP public route design

| Route                    | Purpose                                    | Access                |
| ------------------------ | ------------------------------------------ | --------------------- |
| `/`                      | Lead, featured, and section-based homepage | Public                |
| `/articles/[slug]`       | Published article                          | Public when published |
| `/sections/[slug]`       | Section archive                            | Public                |
| `/categories/[slug]`     | Category archive                           | Public                |
| `/tags/[slug]`           | Tag archive                                | Public                |
| `/authors/[slug]`        | Author biography and articles              | Public                |
| `/search`                | Published-content search                   | Public                |
| `/about`                 | Mission, history, and staff information    | Public                |
| `/letters`               | Published Letter to the Editor archive     | Public                |
| `/letters/how-to-submit` | Submission instructions                    | Public                |
| `/sign-in`               | Google sign-in                             | Public                |
| Not-found boundary       | Search and return-home recovery            | Public                |

Newsletter signup is deferred.

## Full MVP dashboard route design

| Route                           | Purpose                                        | Access         |
| ------------------------------- | ---------------------------------------------- | -------------- |
| `/dashboard`                    | Summary and My Articles                        | Active members |
| `/dashboard/articles/new`       | Create article                                 | Author/admin   |
| `/dashboard/articles/[id]`      | Edit owned or administrator-accessible article | Owner/admin    |
| `/dashboard/profile`            | Edit own public profile                        | Author/admin   |
| `/dashboard/admin/articles`     | Manage all content and archives                | Admin          |
| `/dashboard/admin/members`      | Approve/deactivate members and roles           | Admin          |
| `/dashboard/admin/contributors` | Manage credited profiles                       | Admin          |
| `/dashboard/admin/taxonomy`     | Manage sections, categories, and tags          | Admin          |
| `/dashboard/admin/homepage`     | Curate lead, Featured News, and Read This      | Admin          |
| `/dashboard/admin/site`         | Edit allowlisted site information              | Admin          |
| `/dashboard/admin/audit`        | Review audit activity                          | Admin          |

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
