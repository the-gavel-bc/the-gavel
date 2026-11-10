# Current work

- Phase: 5, Task 10 homepage reader UI on `feat/public-homepage-ui`, based on Task 9 PR #58. Merge prerequisites #56–#58 before this main-targeting PR.
- [Task 10 plan](docs/superpowers/plans/2026-11-09-public-homepage-ui.md) records hero/Latest/Featured/section composition, request-scoped body/footer reuse and verification.
- Verified: all 696 unit tests, production build, TypeScript, lint and formatting.
- Real production browser proof passed at 320/768/1440px and mobile without JavaScript. Checked curation/edit/archive/restore appeared on the next request; one homepage RPC served metadata/body/footer. Empty, reserved-only, text-only and unavailable/noindex states passed.
- Branding/screenshots and human visual/accessibility review remain pending. Owner monitors hosted CI. Media cache/backfill and other Phase 5 decisions remain in the reader contract.
- Next: Task 11 safe canonical article-body renderer, then Task 12 public article page.
