# Frontend/backend ownership refactor

## Scope and baseline

Preserve Next.js/Supabase behavior while separating presentation, server operations, and browser-safe contracts. Reference SED-Capstone for ownership and colocation, not its Express deployment or controller layering. This plan implements the structure explicitly requested by the owner.

Branch: `refactor/frontend-backend-ownership`. Baseline integrates Task 15 (`823baf0`, PR #46) and main (`3c92d7c`, including Task 14). Integration preserves both site-settings and deletion fixtures and documentation. The feature PR remains independently owned; this branch must not omit it or claim its hosted/human gates complete.

## Dependency rules and exceptions

- app retains framework routing and composition. instrumentation.ts and proxy.ts remain in place.
- frontend owns presentation, including Server Components; no blanket use-client directives. Frontend may import explicit use-server entry points and erased backend type imports, but no ordinary backend runtime modules. Type-only query result imports avoid duplicating existing DTO definitions during this mechanical refactor.
- backend cannot import presentation or app entry points. Non-action backend runtime modules receive server-only guards. Actions retain use-server and independent authorization.
- shared contains pure contracts, generated types and public environment validation. No application runtime dependency on backend/frontend, Node APIs, server secrets or cookies. Colocated tests and the existing Node fixture reader are test-only exceptions, not shared runtime exports.
- Browser Supabase client stays frontend; cookie/service clients stay backend. SQL/RLS remain authoritative.
- Existing named module folders and explicit imports stay; flattening unrelated modules is outside scope. Shared layout styles move to frontend/styles, an intentional presentation-owned addition.

## Risks and acceptance

Preserve action boundaries, CSS ownership, dynamic imports, vi.mock resolution, JSON fixture URLs, generated-type paths, and test discovery. No changes to RPC signatures, migrations, transactions, retry handles, version recovery, upload/cleanup races, lifecycle, URLs, or UI. Verify secret-bearing modules cannot reach browser imports; lint must reject alias and relative boundary violations. Keep tests proving authorization and exact retry behavior.

## Sequence and verification

1. Integrate main and pending Task 15; run baseline types and unit tests.
2. Move shared contracts and infrastructure, then domain operations and frontend owners with import/configuration updates. Keep implementation bodies unchanged. Commit coherent moves separately from boundary enforcement.
3. Add lint boundary enforcement with focused positive/negative rule tests and server-only guards; review imports and diff.
4. Update authoritative organization docs and current status.
5. Run typecheck, lint, unit tests, format check, production build, generated-type drift, SQL permission tests, contract/editor/concurrency checks and affected browser journeys. Do not reset existing local data or monitor hosted CI. Record actual outcomes and blockers.

Rollback: revert refactor commits in reverse order; no schema/data rollback is needed. Stop when the requested structure and preservation checks hold.

## File mapping

Exact moves, including companion files; other files retain their locations.

- `src/components/dashboard/admin-articles/admin-article-list.tsx` → `src/frontend/features/articles/components/admin-articles/admin-article-list.tsx`
- `src/components/dashboard/admin-articles/admin-articles.module.css` → `src/frontend/features/articles/components/admin-articles/admin-articles.module.css`
- `src/components/dashboard/admin-audit/admin-audit.module.css` → `src/frontend/features/articles/components/admin-audit/admin-audit.module.css`
- `src/components/dashboard/admin-audit/admin-audit.test.tsx` → `src/frontend/features/articles/components/admin-audit/admin-audit.test.tsx`
- `src/components/dashboard/admin-audit/admin-audit.tsx` → `src/frontend/features/articles/components/admin-audit/admin-audit.tsx`
- `src/components/dashboard/admin-contributors/contributor-controls.tsx` → `src/frontend/features/contributors/components/admin-contributors/contributor-controls.tsx`
- `src/components/dashboard/admin-homepage/homepage-editor.test.tsx` → `src/frontend/features/homepage/components/admin-homepage/homepage-editor.test.tsx`
- `src/components/dashboard/admin-homepage/homepage-editor.tsx` → `src/frontend/features/homepage/components/admin-homepage/homepage-editor.tsx`
- `src/components/dashboard/admin-homepage/published-story-catalog.tsx` → `src/frontend/features/homepage/components/admin-homepage/published-story-catalog.tsx`
- `src/components/dashboard/admin-members/admin-member-list.test.tsx` → `src/frontend/features/memberships/components/admin-members/admin-member-list.test.tsx`
- `src/components/dashboard/admin-members/admin-member-list.tsx` → `src/frontend/features/memberships/components/admin-members/admin-member-list.tsx`
- `src/components/dashboard/admin-members/admin-members.module.css` → `src/frontend/features/memberships/components/admin-members/admin-members.module.css`
- `src/components/dashboard/admin-members/member-controls.test.tsx` → `src/frontend/features/memberships/components/admin-members/member-controls.test.tsx`
- `src/components/dashboard/admin-members/member-controls.tsx` → `src/frontend/features/memberships/components/admin-members/member-controls.tsx`
- `src/components/dashboard/admin-site/site-information-form.test.tsx` → `src/frontend/features/site-information/components/admin-site/site-information-form.test.tsx`
- `src/components/dashboard/admin-site/site-information-form.tsx` → `src/frontend/features/site-information/components/admin-site/site-information-form.tsx`
- `src/components/dashboard/admin-taxonomy/taxonomy-controls.test.tsx` → `src/frontend/features/taxonomy/components/admin-taxonomy/taxonomy-controls.test.tsx`
- `src/components/dashboard/admin-taxonomy/taxonomy-controls.tsx` → `src/frontend/features/taxonomy/components/admin-taxonomy/taxonomy-controls.tsx`
- `src/components/dashboard/article-deletion/article-deletion.test.tsx` → `src/frontend/features/articles/components/article-deletion/article-deletion.test.tsx`
- `src/components/dashboard/article-deletion/article-deletion.tsx` → `src/frontend/features/articles/components/article-deletion/article-deletion.tsx`
- `src/components/dashboard/article-lifecycle-controls/article-lifecycle-controls.test.tsx` → `src/frontend/features/articles/components/article-lifecycle-controls/article-lifecycle-controls.test.tsx`
- `src/components/dashboard/article-lifecycle-controls/article-lifecycle-controls.tsx` → `src/frontend/features/articles/components/article-lifecycle-controls/article-lifecycle-controls.tsx`
- `src/components/dashboard/article-list/article-list.module.css` → `src/frontend/features/articles/components/article-list/article-list.module.css`
- `src/components/dashboard/article-list/article-list.test.tsx` → `src/frontend/features/articles/components/article-list/article-list.test.tsx`
- `src/components/dashboard/article-list/article-list.tsx` → `src/frontend/features/articles/components/article-list/article-list.tsx`
- `src/components/dashboard/article-list-error/article-list-error.tsx` → `src/frontend/features/articles/components/article-list-error/article-list-error.tsx`
- `src/components/dashboard/article-media/article-media.module.css` → `src/frontend/features/articles/components/article-media/article-media.module.css`
- `src/components/dashboard/article-media/article-media.test.tsx` → `src/frontend/features/articles/components/article-media/article-media.test.tsx`
- `src/components/dashboard/article-media/article-media.tsx` → `src/frontend/features/articles/components/article-media/article-media.tsx`
- `src/components/dashboard/article-page-link/article-page-link.test.tsx` → `src/frontend/features/articles/components/article-page-link/article-page-link.test.tsx`
- `src/components/dashboard/article-page-link/article-page-link.tsx` → `src/frontend/features/articles/components/article-page-link/article-page-link.tsx`
- `src/components/dashboard/dashboard-shell/dashboard-shell.module.css` → `src/frontend/components/dashboard/dashboard-shell/dashboard-shell.module.css`
- `src/components/dashboard/dashboard-shell/dashboard-shell.test.tsx` → `src/frontend/components/dashboard/dashboard-shell/dashboard-shell.test.tsx`
- `src/components/dashboard/dashboard-shell/dashboard-shell.tsx` → `src/frontend/components/dashboard/dashboard-shell/dashboard-shell.tsx`
- `src/components/dashboard/dashboard-sign-out-form/dashboard-sign-out-form.tsx` → `src/frontend/features/auth/components/dashboard-sign-out-form/dashboard-sign-out-form.tsx`
- `src/components/dashboard/draft-conflict-panel/draft-conflict-panel.module.css` → `src/frontend/features/articles/components/draft-conflict-panel/draft-conflict-panel.module.css`
- `src/components/dashboard/draft-conflict-panel/draft-conflict-panel.test.tsx` → `src/frontend/features/articles/components/draft-conflict-panel/draft-conflict-panel.test.tsx`
- `src/components/dashboard/draft-conflict-panel/draft-conflict-panel.tsx` → `src/frontend/features/articles/components/draft-conflict-panel/draft-conflict-panel.tsx`
- `src/components/dashboard/draft-conflict-panel/draft-conflict-recovery.test.tsx` → `src/frontend/features/articles/components/draft-conflict-panel/draft-conflict-recovery.test.tsx`
- `src/components/dashboard/draft-conflict-panel/draft-snapshot.test.tsx` → `src/frontend/features/articles/components/draft-conflict-panel/draft-snapshot.test.tsx`
- `src/components/dashboard/draft-conflict-panel/draft-snapshot.tsx` → `src/frontend/features/articles/components/draft-conflict-panel/draft-snapshot.tsx`
- `src/components/dashboard/draft-contributor-fields/draft-contributor-fields.module.css` → `src/frontend/features/contributors/components/draft-contributor-fields/draft-contributor-fields.module.css`
- `src/components/dashboard/draft-contributor-fields/draft-contributor-fields.test.tsx` → `src/frontend/features/contributors/components/draft-contributor-fields/draft-contributor-fields.test.tsx`
- `src/components/dashboard/draft-contributor-fields/draft-contributor-fields.tsx` → `src/frontend/features/contributors/components/draft-contributor-fields/draft-contributor-fields.tsx`
- `src/components/dashboard/draft-editor/draft-body-image-control.test.tsx` → `src/frontend/features/articles/components/draft-editor/draft-body-image-control.test.tsx`
- `src/components/dashboard/draft-editor/draft-body-image-control.tsx` → `src/frontend/features/articles/components/draft-editor/draft-body-image-control.tsx`
- `src/components/dashboard/draft-editor/draft-editor.module.css` → `src/frontend/features/articles/components/draft-editor/draft-editor.module.css`
- `src/components/dashboard/draft-editor/draft-editor.test.tsx` → `src/frontend/features/articles/components/draft-editor/draft-editor.test.tsx`
- `src/components/dashboard/draft-editor/draft-editor.tsx` → `src/frontend/features/articles/components/draft-editor/draft-editor.tsx`
- `src/components/dashboard/draft-editor/draft-paste.test.ts` → `src/frontend/features/articles/components/draft-editor/draft-paste.test.ts`
- `src/components/dashboard/draft-editor/draft-paste.ts` → `src/frontend/features/articles/components/draft-editor/draft-paste.ts`
- `src/components/dashboard/draft-editor/draft-read-only-body.test.tsx` → `src/frontend/features/articles/components/draft-editor/draft-read-only-body.test.tsx`
- `src/components/dashboard/draft-editor/draft-read-only-body.tsx` → `src/frontend/features/articles/components/draft-editor/draft-read-only-body.tsx`
- `src/components/dashboard/draft-form/draft-form.module.css` → `src/frontend/features/articles/components/draft-form/draft-form.module.css`
- `src/components/dashboard/draft-form/draft-form.test.tsx` → `src/frontend/features/articles/components/draft-form/draft-form.test.tsx`
- `src/components/dashboard/draft-form/draft-form.tsx` → `src/frontend/features/articles/components/draft-form/draft-form.tsx`
- `src/components/dashboard/draft-form/use-draft-categories.test.ts` → `src/frontend/features/articles/components/draft-form/use-draft-categories.test.ts`
- `src/components/dashboard/draft-form/use-draft-categories.ts` → `src/frontend/features/articles/components/draft-form/use-draft-categories.ts`
- `src/components/dashboard/draft-form/use-draft-command.test.ts` → `src/frontend/features/articles/components/draft-form/use-draft-command.test.ts`
- `src/components/dashboard/draft-form/use-draft-command.ts` → `src/frontend/features/articles/components/draft-form/use-draft-command.ts`
- `src/components/dashboard/draft-metadata-fields/draft-metadata-fields.module.css` → `src/frontend/features/articles/components/draft-metadata-fields/draft-metadata-fields.module.css`
- `src/components/dashboard/draft-metadata-fields/draft-metadata-fields.test.tsx` → `src/frontend/features/articles/components/draft-metadata-fields/draft-metadata-fields.test.tsx`
- `src/components/dashboard/draft-metadata-fields/draft-metadata-fields.tsx` → `src/frontend/features/articles/components/draft-metadata-fields/draft-metadata-fields.tsx`
- `src/components/dashboard/draft-navigation-guard/draft-navigation-guard.test.tsx` → `src/frontend/components/dashboard/draft-navigation-guard/draft-navigation-guard.test.tsx`
- `src/components/dashboard/draft-navigation-guard/draft-navigation-guard.tsx` → `src/frontend/components/dashboard/draft-navigation-guard/draft-navigation-guard.tsx`
- `src/components/dashboard/draft-taxonomy-fields/draft-taxonomy-fields.module.css` → `src/frontend/features/taxonomy/components/draft-taxonomy-fields/draft-taxonomy-fields.module.css`
- `src/components/dashboard/draft-taxonomy-fields/draft-taxonomy-fields.test.tsx` → `src/frontend/features/taxonomy/components/draft-taxonomy-fields/draft-taxonomy-fields.test.tsx`
- `src/components/dashboard/draft-taxonomy-fields/draft-taxonomy-fields.tsx` → `src/frontend/features/taxonomy/components/draft-taxonomy-fields/draft-taxonomy-fields.tsx`
- `src/components/dashboard/draft-toolbar/draft-toolbar.module.css` → `src/frontend/features/articles/components/draft-toolbar/draft-toolbar.module.css`
- `src/components/dashboard/draft-toolbar/draft-toolbar.test.tsx` → `src/frontend/features/articles/components/draft-toolbar/draft-toolbar.test.tsx`
- `src/components/dashboard/draft-toolbar/draft-toolbar.tsx` → `src/frontend/features/articles/components/draft-toolbar/draft-toolbar.tsx`
- `src/components/dashboard/guarded-dashboard-link/guarded-dashboard-link.tsx` → `src/frontend/components/dashboard/guarded-dashboard-link/guarded-dashboard-link.tsx`
- `src/components/dashboard/media-cleanup/media-cleanup-control.tsx` → `src/frontend/features/media/components/media-cleanup/media-cleanup-control.tsx`
- `src/components/dashboard/profile/own-profile-form.test.tsx` → `src/frontend/features/profiles/components/profile/own-profile-form.test.tsx`
- `src/components/dashboard/profile/own-profile-form.tsx` → `src/frontend/features/profiles/components/profile/own-profile-form.tsx`
- `src/components/site/public-shell/public-shell.module.css` → `src/frontend/components/site/public-shell/public-shell.module.css`
- `src/components/site/public-shell/public-shell.test.tsx` → `src/frontend/components/site/public-shell/public-shell.test.tsx`
- `src/components/site/public-shell/public-shell.tsx` → `src/frontend/components/site/public-shell/public-shell.tsx`
- `src/components/site/site-footer/site-footer.module.css` → `src/frontend/components/site/site-footer/site-footer.module.css`
- `src/components/site/site-footer/site-footer.tsx` → `src/frontend/components/site/site-footer/site-footer.tsx`
- `src/components/site/site-header/site-header.module.css` → `src/frontend/components/site/site-header/site-header.module.css`
- `src/components/site/site-header/site-header.tsx` → `src/frontend/components/site/site-header/site-header.tsx`
- `src/components/site/skip-link/skip-link.module.css` → `src/frontend/components/site/skip-link/skip-link.module.css`
- `src/components/site/skip-link/skip-link.tsx` → `src/frontend/components/site/skip-link/skip-link.tsx`
- `src/components/ui/button/button.module.css` → `src/frontend/components/ui/button/button.module.css`
- `src/components/ui/button/button.tsx` → `src/frontend/components/ui/button/button.tsx`
- `src/components/ui/link-button/link-button.tsx` → `src/frontend/components/ui/link-button/link-button.tsx`
- `src/lib/articles/admin-article-queries/admin-article-queries.test.ts` → `src/backend/articles/admin-article-queries/admin-article-queries.test.ts`
- `src/lib/articles/admin-article-queries/admin-article-queries.ts` → `src/backend/articles/admin-article-queries/admin-article-queries.ts`
- `src/lib/articles/admin-audit/admin-audit.test.ts` → `src/backend/articles/admin-audit/admin-audit.test.ts`
- `src/lib/articles/admin-audit/admin-audit.ts` → `src/backend/articles/admin-audit/admin-audit.ts`
- `src/lib/articles/article-deletion/article-deletion-actions.test.ts` → `src/backend/articles/article-deletion/article-deletion-actions.test.ts`
- `src/lib/articles/article-deletion/article-deletion-actions.ts` → `src/backend/articles/article-deletion/article-deletion-actions.ts`
- `src/lib/articles/article-deletion/article-deletion.test.ts` → `src/shared/articles/article-deletion/article-deletion.test.ts`
- `src/lib/articles/article-deletion/article-deletion.ts` → `src/shared/articles/article-deletion/article-deletion.ts`
- `src/lib/articles/article-lifecycle/article-lifecycle-actions.ts` → `src/backend/articles/article-lifecycle/article-lifecycle-actions.ts`
- `src/lib/articles/article-lifecycle/article-lifecycle.test.ts` → `src/shared/articles/article-lifecycle/article-lifecycle.test.ts`
- `src/lib/articles/article-lifecycle/article-lifecycle.ts` → `src/shared/articles/article-lifecycle/article-lifecycle.ts`
- `src/lib/articles/draft-action-contract/draft-action-contract.test.ts` → `src/shared/articles/draft-action-contract/draft-action-contract.test.ts`
- `src/lib/articles/draft-action-contract/draft-action-contract.ts` → `src/shared/articles/draft-action-contract/draft-action-contract.ts`
- `src/lib/articles/draft-actions/draft-action-transport.test.ts` → `src/backend/articles/draft-actions/draft-action-transport.test.ts`
- `src/lib/articles/draft-actions/draft-actions.test.ts` → `src/backend/articles/draft-actions/draft-actions.test.ts`
- `src/lib/articles/draft-actions/draft-actions.ts` → `src/backend/articles/draft-actions/draft-actions.ts`
- `src/lib/articles/draft-category-action/draft-category-action.test.ts` → `src/backend/articles/draft-category-action/draft-category-action.test.ts`
- `src/lib/articles/draft-category-action/draft-category-action.ts` → `src/backend/articles/draft-category-action/draft-category-action.ts`
- `src/lib/articles/draft-contract/draft-cases.json` → `src/shared/articles/draft-contract/draft-cases.json`
- `src/lib/articles/draft-contract/draft-contract.test.ts` → `src/shared/articles/draft-contract/draft-contract.test.ts`
- `src/lib/articles/draft-contract/draft-contract.ts` → `src/shared/articles/draft-contract/draft-contract.ts`
- `src/lib/articles/draft-contract/draft-json.ts` → `src/shared/articles/draft-contract/draft-json.ts`
- `src/lib/articles/draft-contract/draft-link.ts` → `src/shared/articles/draft-contract/draft-link.ts`
- `src/lib/articles/draft-contract/draft-metadata.test.ts` → `src/shared/articles/draft-contract/draft-metadata.test.ts`
- `src/lib/articles/draft-contract/draft-test-cases.ts` → `src/shared/articles/draft-contract/draft-test-cases.ts`
- `src/lib/articles/draft-cursor/draft-cursor.test.ts` → `src/shared/articles/draft-cursor/draft-cursor.test.ts`
- `src/lib/articles/draft-cursor/draft-cursor.ts` → `src/shared/articles/draft-cursor/draft-cursor.ts`
- `src/lib/articles/draft-document/draft-document.test.ts` → `src/frontend/features/articles/draft-document/draft-document.test.ts`
- `src/lib/articles/draft-document/draft-document.ts` → `src/frontend/features/articles/draft-document/draft-document.ts`
- `src/lib/articles/draft-document/draft-extensions.test.ts` → `src/frontend/features/articles/draft-document/draft-extensions.test.ts`
- `src/lib/articles/draft-document/draft-extensions.ts` → `src/frontend/features/articles/draft-document/draft-extensions.ts`
- `src/lib/articles/draft-document/draft-image-node.ts` → `src/frontend/features/articles/draft-document/draft-image-node.ts`
- `src/lib/articles/draft-options/draft-options.test.ts` → `src/backend/articles/draft-options/draft-options.test.ts`
- `src/lib/articles/draft-options/draft-options.ts` → `src/backend/articles/draft-options/draft-options.ts`
- `src/lib/articles/draft-queries/draft-detail.test.ts` → `src/backend/articles/draft-queries/draft-detail.test.ts`
- `src/lib/articles/draft-queries/draft-queries.test.ts` → `src/backend/articles/draft-queries/draft-queries.test.ts`
- `src/lib/articles/draft-queries/draft-queries.ts` → `src/backend/articles/draft-queries/draft-queries.ts`
- `src/lib/articles/draft-queries/draft-query-test-client.ts` → `src/backend/articles/draft-queries/draft-query-test-client.ts`
- `src/lib/articles/draft-reload-action/draft-reload-action.test.ts` → `src/backend/articles/draft-reload-action/draft-reload-action.test.ts`
- `src/lib/articles/draft-reload-action/draft-reload-action.ts` → `src/backend/articles/draft-reload-action/draft-reload-action.ts`
- `src/lib/articles/draft-save-state/draft-input-key.ts` → `src/frontend/features/articles/draft-save-state/draft-input-key.ts`
- `src/lib/articles/draft-save-state/draft-save-recovery.test.ts` → `src/frontend/features/articles/draft-save-state/draft-save-recovery.test.ts`
- `src/lib/articles/draft-save-state/draft-save-state.test.ts` → `src/frontend/features/articles/draft-save-state/draft-save-state.test.ts`
- `src/lib/articles/draft-save-state/draft-save-state.ts` → `src/frontend/features/articles/draft-save-state/draft-save-state.ts`
- `src/lib/articles/draft-selections/draft-selections.test.ts` → `src/frontend/features/articles/draft-selections/draft-selections.test.ts`
- `src/lib/articles/draft-selections/draft-selections.ts` → `src/frontend/features/articles/draft-selections/draft-selections.ts`
- `src/lib/auth/access/access.test.ts` → `src/backend/auth/access/access.test.ts`
- `src/lib/auth/access/access.ts` → `src/backend/auth/access/access.ts`
- `src/lib/auth/actions/actions.ts` → `src/backend/auth/actions/actions.ts`
- `src/lib/auth/redirect/redirect.test.ts` → `src/shared/auth/redirect/redirect.test.ts`
- `src/lib/auth/redirect/redirect.ts` → `src/shared/auth/redirect/redirect.ts`
- `src/lib/contributors/admin-contributors/admin-contributors.test.ts` → `src/backend/contributors/admin-contributors/admin-contributors.test.ts`
- `src/lib/contributors/admin-contributors/admin-contributors.ts` → `src/backend/contributors/admin-contributors/admin-contributors.ts`
- `src/lib/contributors/contributor-command/contributor-actions.test.ts` → `src/backend/contributors/contributor-command/contributor-actions.test.ts`
- `src/lib/contributors/contributor-command/contributor-actions.ts` → `src/backend/contributors/contributor-command/contributor-actions.ts`
- `src/lib/contributors/contributor-command/contributor-command.test.ts` → `src/shared/contributors/contributor-command/contributor-command.test.ts`
- `src/lib/contributors/contributor-command/contributor-command.ts` → `src/shared/contributors/contributor-command/contributor-command.ts`
- `src/lib/env/public/public.test.ts` → `src/shared/env/public/public.test.ts`
- `src/lib/env/public/public.ts` → `src/shared/env/public/public.ts`
- `src/lib/env/schema/schema.ts` → `src/shared/env/schema/schema.ts`
- `src/lib/env/server/server.test.ts` → `src/backend/infrastructure/env/server/server.test.ts`
- `src/lib/env/server/server.ts` → `src/backend/infrastructure/env/server/server.ts`
- `src/lib/homepage/homepage-curation/homepage-actions.test.ts` → `src/backend/homepage/homepage-curation/homepage-actions.test.ts`
- `src/lib/homepage/homepage-curation/homepage-actions.ts` → `src/backend/homepage/homepage-curation/homepage-actions.ts`
- `src/lib/homepage/homepage-curation/homepage-command.test.ts` → `src/shared/homepage/homepage-curation/homepage-command.test.ts`
- `src/lib/homepage/homepage-curation/homepage-command.ts` → `src/shared/homepage/homepage-curation/homepage-command.ts`
- `src/lib/homepage/homepage-curation/homepage-curation.test.ts` → `src/backend/homepage/homepage-curation/homepage-curation.test.ts`
- `src/lib/homepage/homepage-curation/homepage-curation.ts` → `src/backend/homepage/homepage-curation/homepage-curation.ts`
- `src/lib/media/image-intake/image-intake.test.ts` → `src/backend/media/image-intake/image-intake.test.ts`
- `src/lib/media/image-intake/image-intake.ts` → `src/backend/media/image-intake/image-intake.ts`
- `src/lib/media/image-intake/media-form.test.ts` → `src/backend/media/image-intake/media-form.test.ts`
- `src/lib/media/image-intake/media-form.ts` → `src/backend/media/image-intake/media-form.ts`
- `src/lib/media/media-actions/media-actions.test.ts` → `src/backend/media/media-actions/media-actions.test.ts`
- `src/lib/media/media-actions/media-actions.ts` → `src/backend/media/media-actions/media-actions.ts`
- `src/lib/media/media-queries/media-queries.test.ts` → `src/backend/media/media-queries/media-queries.test.ts`
- `src/lib/media/media-queries/media-queries.ts` → `src/backend/media/media-queries/media-queries.ts`
- `src/lib/media/media-removal/media-removal.test.ts` → `src/backend/media/media-removal/media-removal.test.ts`
- `src/lib/media/media-removal/media-removal.ts` → `src/backend/media/media-removal/media-removal.ts`
- `src/lib/media/retired-media-cleanup/cleanup-actions.test.ts` → `src/backend/media/retired-media-cleanup/cleanup-actions.test.ts`
- `src/lib/media/retired-media-cleanup/cleanup-actions.ts` → `src/backend/media/retired-media-cleanup/cleanup-actions.ts`
- `src/lib/media/retired-media-cleanup/cleanup-status.ts` → `src/backend/media/retired-media-cleanup/cleanup-status.ts`
- `src/lib/media/retired-media-cleanup/retired-media-cleanup.test.ts` → `src/backend/media/retired-media-cleanup/retired-media-cleanup.test.ts`
- `src/lib/media/retired-media-cleanup/retired-media-cleanup.ts` → `src/backend/media/retired-media-cleanup/retired-media-cleanup.ts`
- `src/lib/memberships/member-audit/member-audit.test.ts` → `src/backend/memberships/member-audit/member-audit.test.ts`
- `src/lib/memberships/member-audit/member-audit.ts` → `src/backend/memberships/member-audit/member-audit.ts`
- `src/lib/memberships/member-command/member-actions.test.ts` → `src/backend/memberships/member-command/member-actions.test.ts`
- `src/lib/memberships/member-command/member-actions.ts` → `src/backend/memberships/member-command/member-actions.ts`
- `src/lib/memberships/member-command/member-command.test.ts` → `src/shared/memberships/member-command/member-command.test.ts`
- `src/lib/memberships/member-command/member-command.ts` → `src/shared/memberships/member-command/member-command.ts`
- `src/lib/memberships/member-directory/member-directory.test.ts` → `src/backend/memberships/member-directory/member-directory.test.ts`
- `src/lib/memberships/member-directory/member-directory.ts` → `src/backend/memberships/member-directory/member-directory.ts`
- `src/lib/profiles/own-profile/own-profile-actions.test.ts` → `src/backend/profiles/own-profile/own-profile-actions.test.ts`
- `src/lib/profiles/own-profile/own-profile-actions.ts` → `src/backend/profiles/own-profile/own-profile-actions.ts`
- `src/lib/profiles/own-profile/own-profile-command.test.ts` → `src/shared/profiles/own-profile/own-profile-command.test.ts`
- `src/lib/profiles/own-profile/own-profile-command.ts` → `src/shared/profiles/own-profile/own-profile-command.ts`
- `src/lib/profiles/own-profile/own-profile.test.ts` → `src/backend/profiles/own-profile/own-profile.test.ts`
- `src/lib/profiles/own-profile/own-profile.ts` → `src/backend/profiles/own-profile/own-profile.ts`
- `src/lib/site-information/site-information/site-information-actions.test.ts` → `src/backend/site-information/site-information/site-information-actions.test.ts`
- `src/lib/site-information/site-information/site-information-actions.ts` → `src/backend/site-information/site-information/site-information-actions.ts`
- `src/lib/site-information/site-information/site-information-command.test.ts` → `src/shared/site-information/site-information/site-information-command.test.ts`
- `src/lib/site-information/site-information/site-information-command.ts` → `src/shared/site-information/site-information/site-information-command.ts`
- `src/lib/site-information/site-information/site-information.ts` → `src/backend/site-information/site-information/site-information.ts`
- `src/lib/startup/startup.test.ts` → `src/backend/infrastructure/startup/startup.test.ts`
- `src/lib/startup/startup.ts` → `src/backend/infrastructure/startup/startup.ts`
- `src/lib/supabase/browser/browser.ts` → `src/frontend/lib/supabase/browser.ts`
- `src/lib/supabase/database/database.types.ts` → `src/shared/database/database.types.ts`
- `src/lib/supabase/media-admin/media-admin.ts` → `src/backend/infrastructure/supabase/media-admin/media-admin.ts`
- `src/lib/supabase/proxy/proxy.ts` → `src/backend/infrastructure/supabase/proxy/proxy.ts`
- `src/lib/supabase/server/server.test.ts` → `src/backend/infrastructure/supabase/server/server.test.ts`
- `src/lib/supabase/server/server.ts` → `src/backend/infrastructure/supabase/server/server.ts`
- `src/lib/taxonomy/admin-taxonomy/admin-taxonomy.test.ts` → `src/backend/taxonomy/admin-taxonomy/admin-taxonomy.test.ts`
- `src/lib/taxonomy/admin-taxonomy/admin-taxonomy.ts` → `src/backend/taxonomy/admin-taxonomy/admin-taxonomy.ts`
- `src/lib/taxonomy/taxonomy-command/taxonomy-actions.test.ts` → `src/backend/taxonomy/taxonomy-command/taxonomy-actions.test.ts`
- `src/lib/taxonomy/taxonomy-command/taxonomy-actions.ts` → `src/backend/taxonomy/taxonomy-command/taxonomy-actions.ts`
- `src/lib/taxonomy/taxonomy-command/taxonomy-command.test.ts` → `src/shared/taxonomy/taxonomy-command/taxonomy-command.test.ts`
- `src/lib/taxonomy/taxonomy-command/taxonomy-command.ts` → `src/shared/taxonomy/taxonomy-command/taxonomy-command.ts`
- `src/styles/shell/shell.module.css` → `src/frontend/styles/shell/shell.module.css`

## Verification and review

- Integrated baseline: `pnpm typecheck`; `pnpm test` — 628 tests passed.
- After moves: TypeScript and the same 628 tests passed.
- Guards and lint: TypeScript, lint and 639 tests passed (628 existing plus 11 boundary cases). Review found bare Node builtins bypassed the rule; `isBuiltin()` now covers both forms. The focused boundary suite passed all 13 cases after adding two regressions; lint passed again.
- `pnpm db:types:check`: generated output matches the local database, including Tasks 14 and 15.
- `pnpm test:db`: 1,575 assertions passed. `pnpm test:draft-contract`: 214 passed. `pnpm test:draft-editor`: 8 passed. `pnpm test:draft-concurrency`: 48 passed.
- `pnpm format:check` passed again after final documentation updates.
- Production build succeeded through Playwright's configured web server. Full browser run: 132 passed, 3 skipped, 1 failed. The run found a missing Task 14 cleanup block in the baseline merge; restored the original guarded cleanup and recovered only this run's synthetic site fixture. Focused `pnpm test:e2e e2e/drafts/admin-site-information.spec.ts` recheck: 3 passed, 1 shared-record write skipped. Both production builds succeeded. The full suite was not rerun after the fixture-only repair.
- Independent review inspected the moves, boundary enforcement and documentation. Fixed its bare-builtin finding and three stale documentation paths. Human maintainer review remains separate.
- No migration, package manifest, lockfile, RPC, authorization, or UI behavior change relative to the integrated baseline. SQL tests used the existing local project without resetting data. Hosted CI, real OAuth, hosted cron and human accessibility/security review are not claimed.

## Readability follow-up

The owner requested contributor-facing structure documentation and comments for code whose intent is not apparent at a glance. Complete the existing architecture, API, component, security, and coding guidance; keep architecture authoritative for folder ownership. Add short comments explaining retry snapshots, stale responses, storage cleanup leases, editor translation, and validation invariants. Do not annotate obvious assignments, modify applied SQL migrations, or change executable behavior. Verify source tokens are unchanged, run formatting/lint and the existing focused tests covering the annotated modules, and record results here.

Follow-up results:

- Structure guidance now includes the tree and save walkthrough in architecture, source placement in the development workflow, component locations, current API paths, security boundary guidance, comment conventions, and ownership-check instructions. Historical plans retain their original file paths; the mapping above records their destinations.
- Comments added to 12 source files explain immutable retries, dirty editor state, stale catalog responses, retryable image cleanup, recurring sweep claims, editor defaults, query snapshots, cookie refresh, bounded JSON validation and import exceptions.
- `node /tmp/gavel-comment-proof.cjs` parsed each annotated source file with TypeScript, removed comments, and compared syntax-token kind/text pairs against `cf1d39c`: all 12 matched. The temporary verification helper is not application code.
- `pnpm typecheck`, `pnpm lint`, and `pnpm exec prettier --check src scripts/import-boundaries docs/testing.md` passed. `git diff --check` passed.
- Focused `pnpm exec vitest run` passed 322 tests in 15 files: import boundaries; article save state, command/category hooks, body-image controls and document conversion; draft queries; media removal/cleanup; draft validation; and the article media route.
- No executable, import, configuration or schema changes. Database, concurrency and browser suites were not repeated for this comment/documentation-only follow-up.

## CI compatibility follow-up

Inherited Task 15 migration `20261107040300` failed clean CLI startup with SQLSTATE 25P01 because its `LOCK TABLE` statements lacked an explicit transaction. Applied the same correction as PR #46: wrap the existing migration in BEGIN/COMMIT, preserving its schema/data operations and holding locks through backfill and trigger installation. A later migration cannot repair an earlier clean-start failure. Existing applied databases need no reset or replay.

The full duplicate local stack passed all migrations, then timed out on auxiliary service health. A clean disposable CLI start with studio/realtime/logflare/vector excluded completed successfully; all 1,575 SQL assertions passed. CI retains its full service configuration. CI startup now prints a bounded redacted failure tail and preserves the exit status; synthetic success/failure/redaction checks and workflow formatting passed. Hosted CI remains for owner verification.
