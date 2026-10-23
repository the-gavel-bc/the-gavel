# Component hierarchy

Status: Foundation shell, access routes and private My Articles listing implemented; publication and other dashboard feature routes below remain planned.

## Implemented foundation routes

| Route             | Behavior                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| `/`               | Accessible foundation homepage; final publication composition remains planned |
| `/sign-in`        | Server action initiating Google sign-in; hosted provider setup remains manual |
| `/auth/callback`  | PKCE code exchange and safe access routing                                    |
| `/access-pending` | Denied/pending membership experience and sign-out                             |
| `/dashboard`      | Protected owned-article listing with pagination, role-aware shell and sign-out                  |

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

Phase 3 Task 6 connects `/dashboard?cursor=<opaque cursor>` to the checked own-list query. Layout and page retain independent membership guards. Server-owned rows show title, status and UTC update time; only drafts expose edit links. `ArticleList` owns its semantic list and CSS; `ArticlePageLink` owns client-navigation loading feedback; `ArticleListError` shares safe error presentation between server reads and the unexpected client-error boundary.

Initial reads and bounded read/input errors render fully on the server, including without JavaScript. Native next/newest/retry links preserve that behavior; client pagination additionally announces pending work without replacing initial HTML with a streaming loading fallback. The URL owns the cursor; no editor provider or global store is introduced.

Create links target `/dashboard/articles/new` and draft edit links target `/dashboard/articles/[id]`, as specified by the accepted task sequence. Those destinations remain unimplemented until Tasks 7/8 and currently return not-found; prefetch is disabled. This intermediate listing task does not claim working creation/editing. See [screenshots and verification](testing.md#phase-3-task-6-my-articles-listing).
