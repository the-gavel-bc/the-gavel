# Current work

- Phase: 5, Task 5 published-media authorization on `feat/published-media-authorization`, stacked on Task 4 PR #53 at `b219ae8`.
- Owner decisions: include News in navigation; section-scoped category URLs; shared database-wide search rate limit, with explicit shared-capacity/starvation limitation. Initial 120/min is an engineering default, to validate before release.
- [Task 1 contract](docs/superpowers/plans/2026-11-09-phase-five-reader-contract.md) specifies public reads, media/cache, pagination/search, UI mapping and unresolved content/screenshots. [Task 4 plan](docs/superpowers/plans/2026-11-09-public-site-navigation.md) covers public navigation and approved site information; public routes and media delivery remain later tasks.
- The user will provide more screenshots. Logo/font provenance, site copy/taxonomy and profile-image/video contracts remain explicit future inputs/gates. Phase 4 human/hosted/operational review remains outstanding.
- Base PR: [draft #53](https://github.com/dylandrozario/the-gavel/pull/53), stacked on earlier Phase 5 tasks. Owner monitors hosted CI.
- Active plan: [Task 5](docs/superpowers/plans/2026-11-09-published-media-authorization.md). Owner approved five-minute caching for successful published images; pages still check visibility fresh. Task 5 live-reference policy, no-store upstream uploads and owner-approved maintenance backfill are implemented; verified locally (1,681 database assertions and 12 focused unit tests). Task 6 supplies five-minute public delivery caching.
