# Current work

- Phase: editor features; executing [approved plan](docs/superpowers/plans/2026-11-12-editor-tags-contributors-photo.md).
- Worktree: `/private/tmp/the-gavel-uiux`; branch `feat/published-main-photo`.
- Stack: #86, #88, #89, #90 (`feat/editor-photo-autosave`), then C tags, D contributors, B captions, E published photos.
- C open as #91; D open as #92; B open as #93; E open as #94. All four implementations and local verification complete. Hosted CI reruns for #89 and #91–#94 pending; no merges.
- Approved decisions: active authors create tags and guest contributors; UI tag cap ten (database 64); optional 400-character photo caption; owner/admin may edit published main photos.
- Database: disposable `gavel-p5` only (API 58521, DB 58522); symlinks repointed to this worktree. Never reset/use primary projects.
