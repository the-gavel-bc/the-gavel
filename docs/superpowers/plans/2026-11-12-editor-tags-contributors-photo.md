# Editor: typed tags, contributor search and main photo

> Keep decisions and evidence here. Follows the [UI/UX refresh](2026-11-12-ui-ux-refresh.md). This changes contracts in [data model](../../data-model.md) and [security](../../security-and-permissions.md); update both with each slice.

**Goal:** Make the article editor feel like the demo contributor desk:

- tags are typed freely;
- contributors are found by search, or typed in when they aren't on the site;
- the main photo, with its credit and an optional caption, can be added from the start.

## Current behaviour (2026-11-12)

- **Tags:** authors pick from existing tags. No create operation exists, and tag-entry normalization was recorded as unresolved.
- **Contributors:** a dropdown of existing profiles. Only administrators create guest (no-login) profiles, from the Contributors page.
- **Main photo:**
  - `ArticleMedia` (upload, then alt text, credit and attach) appears only after a draft's first save, and only while the article is a draft.
  - `set_article_main_image` rejects any status other than draft.
  - There is no caption.

## Owner decisions (2026-11-12)

1. **Tags:** any active author may create a tag by typing. Input is trimmed and internal whitespace collapsed. An existing tag that matches case-insensitively is reused. Names are 1–120 characters. The editor allows 10 tags per article; the server's existing limit of 64 stays, so older drafts remain valid. Administrators curate tags later.
2. **Contributors:** search existing profiles by name. With no match, a typed name creates a guest contributor profile, with a public author page once credited on a published article. Any active author may create one, and administrators edit or deactivate it later.
3. **Photo:**
   - The photo section is always visible.
   - Choosing a photo on a new draft saves the draft first, then uploads.
   - The upload starts as soon as a file is chosen.
   - The main photo is also editable on published articles.
4. **Caption:** a new optional caption on the main photo, up to 400 characters, shown under the photo on the article page.

## Slices and risks

- **A. Photo flow (frontend only):**
  - The section shows on new drafts. Choosing a file validates the draft, creates it, replaces the URL with the edit URL without remounting, then uploads.
  - The file uploads on selection, with "Retry upload" if that fails.
  - A local preview uses a `blob:` URL, which the CSP already allows.
  - Risks: a create that is uncertain or fails must not upload (an upload needs a confirmed article ID). Draft validation errors block the upload and keep the chosen file. The navigation guard still covers in-flight work.
- **B. Caption:** an additive nullable column on `article_main_images` and a new RPC signature that includes caption in the receipt fingerprint, so retries can't merge different captions. Also the snapshot, public detail projection, article render, generated types and SQL tests.
- **C. Typed tags:**
  - An `ensure_tag(name)` RPC for active members: normalize, `insert … on conflict do nothing`, then select. Concurrent creates of the same name return the same row, and retries are idempotent.
  - Rate-limited by the existing draft-attempt counter. The slug is generated from the name with a uniqueness suffix.
  - The UI is a chip input with autocomplete; Enter or a comma adds a tag.
  - Risk: unused tags left behind by abandoned drafts. Public tag pages only list published articles, so they are harmless for now; administrator cleanup is a follow-up.
- **D. Contributor search and guests:**
  - A search projection over active profiles: name and slug only, never authentication links or email.
  - A `create_guest_contributor(request_id, display_name)` RPC for active members, with request receipts so retries are safe, and a check for an existing case-insensitive name first. Audited like the administrator guest create.
  - The UI is a combobox: search results, then "Add '<name>' as a new contributor".
- **E. Main photo on published articles:**
  - Allow `set_article_main_image` for published articles the caller owns or administers, while keeping the version and conflict checks.
  - Review published media authorization: a newly finalized asset must become publicly servable only once attached, and a replaced asset must go through the existing retention and cleanup.
  - This is the highest-risk slice, so it gets its own review.

## Acceptance (all slices)

- Owners and administrators only. Credits still grant no edit access. Authors cannot read or modify other owners' articles through the new RPCs.
- Every new RPC is idempotent under retry and safe under concurrent identical requests. Each has SQL tests for denial (anonymous, inactive or ineligible callers), normalization, conflicts and replay.
- Visible labels, keyboard-operable comboboxes (ARIA combobox pattern), 44px targets, errors announced.
- Browser check of each flow on the production build against a disposable project.

## Verification record

Slice A:

- Unit: 146 files and 1,013 tests passed, including new tests for the in-place create plus photo handoff, a missing title keeping the photo without creating the draft, and a one-time upload of the handed-over file. Typecheck, lint and format passed.
- E2E specs updated for upload on selection: the "Upload image" clicks were removed from the `article-media` and `body-images` specs. CI runs them.
- Production build against the disposable `gavel-p5` project:
  - On a new draft, choosing a photo while categories were still loading kept the photo and showed the validation message.
  - Create draft then created the article in place, replaced the URL with `/dashboard/articles/<id>`, uploaded the photo and showed the local preview.
  - Alt text and credit were then attached ("Attached image: … — Jane Doe / The Gavel").
  - No console or CSP errors.
- Found and fixed in the browser: a stale selection-error banner stayed after a successful in-place create.

## Execution plan (2026-11-12)

Order: C typed tags (base `feat/editor-photo-autosave`), D contributor search/guests, B caption, then E published main photos. Each slice gets focused SQL/UI tests, generated types, fast checks, production build and disposable-project browser proof, review, and a separate stacked PR. Do not merge.

All database commands target disposable `gavel-p5` at `/private/tmp/gavel-p5-db` (API 58521, DB 58522). Its migrations/tests/seed symlinks now point to `/private/tmp/the-gavel-uiux/supabase`. Primary local projects must not be used. The default full browser suite remains a CI gate because its fixture helper targets the primary project.

### Design risks and recovery

- C: serialize tag slug allocation across all bases, including suffixed names; select again after insertion conflicts. Normalize before case-insensitive lookup. Failed/uncertain requests retain input; identical retries reuse the row. Preserve selected IDs unavailable in the catalog, and permit removal from older drafts above the UI cap of ten.
- D: checked reads expose only active profile ID, display name and slug. Guest creation never creates an Auth identity or membership. Serialize duplicate-name checks and slug allocation, bind immutable receipts to actor/request/payload, replay before consuming rate quota, and audit creation atomically. Debounced searches discard stale results; uncertain creates retain the original request ID and name until resolved.
- B: null represents an empty caption; nonempty values are trimmed and bounded at 400 characters. A signature change must remove the old callable mutation and update grants/callers. Caption joins snapshots/public detail and the immutable media receipt fingerprint. A changed retry payload returns request_conflict.
- E (before implementation): uploads remain private until linked to a published article. Attachment and version increment commit atomically. Replaced/removed assets follow existing revision references and cleanup policy; no retained revision may lose its object. Existing public URLs may remain cached up to five minutes. Dynamic homepage, search, sitemap and article reads must observe the new version/link on their next request. Row/version locking must serialize concurrent attaches and publish/archive races; stale writes conflict, archived writes fail, and replay must preserve original results without reapplying. Owner/admin authority must be checked after waits. Browser proof must compare public rendering before and after replacement.

### Review gates

Every slice must retain anonymous/inactive/ineligible and cross-owner denial coverage, keyboard operation and announced errors. Fresh task review precedes its PR. Human maintainer security review remains outstanding until provided; agent review does not substitute for it.

### Slice C verification

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `git diff --check`: passed with Node 22.20.0.
- `pnpm test`: 148 files, 1,022 tests passed. Focused agent run: six files, 46 tests passed, including async input preservation.
- `node /private/tmp/gavel-uiux-run.mjs reset`, then `node /private/tmp/gavel-uiux-run.mjs sql`: disposable clean migration/seed succeeded; 71 SQL files, 2,115 assertions passed (24 new tag assertions). An initial SQL run overlapped reset and failed against its transient schema; the completed-reset rerun passed.
- `node /private/tmp/gavel-uiux-run.mjs types`: regenerated from disposable DB 58522.
- `python3 /private/tmp/gavel-uiux-tag-race.py`: independent-session identical-name, slug collision, and overlapping-base allocation checks passed.
- `node /private/tmp/gavel-uiux-run.mjs build`: production build passed with disposable API 58521. `... start --port 3150` and `node /private/tmp/gavel-uiux-smoke.mjs`: active author created a typed tag, removed it, and reused the case-insensitive name via comma. No page/console/CSP errors. Synthetic Auth fixtures needed non-null timestamps; this was a fixture repair, not an application change.
- Fresh task review: spec and quality passed; no Critical/Important findings. Full default browser suite not run locally because its fixtures target the primary project; CI runs it. Human maintainer review remains outstanding.

### Slice D verification

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `git diff --check`: passed.
- `pnpm test`: 149 files, 1,030 tests passed. Focused run: five files, 45 tests passed, including stale search, Escape, preserved role changes and exact uncertain retries.
- `node /private/tmp/gavel-uiux-run.mjs up`: additive migration applied to disposable project. Separate completed `... reset`, then `... types` and `... sql`: clean migration/seed and generated types passed; 72 SQL files, 2,147 assertions passed (32 new).
- `python3 /private/tmp/gavel-uiux-guest-race.py`: independent sessions proved distinct actors/case-insensitive names create one guest/audit, same actor/request replays one receipt, and changed payload conflicts.
- `node /private/tmp/gavel-uiux-run.mjs build`: passed. `... start --port 3151` and `node /private/tmp/gavel-uiux-smoke.mjs D`: production browser passed keyboard search/selection, new guest creation/selection and role/order controls. No page/console/CSP errors.
- Fresh task review: spec/quality passed, no Critical/Important findings. Default full browser suite remains for CI; human security/screen-reader review remains outstanding.
- Implementation choice: preserve administrator three-argument guest RPC and add an active-member two-argument overload. Existing names return a safe summary with `created:false`; UI selects that row and announces reuse, preventing duplicate creation.

### E preflight clarification (before coding)

Published attachment also requires extending the existing draft-only upload reservation, processing-admission, claim and trusted-finalization guards. Changing only the attachment RPC/UI would make published uploads fail before attachment. Extend these stages to draft/published owner/admin authority using the current actor/article/asset lock order; keep archived denial and reference-based public Storage authorization. This is necessary for the approved published-photo flow, not a separate body-editor feature. Body-image insertion UI remains draft-only.

### Slice B verification

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `git diff --check`: passed. `pnpm test`: 149 files, 1,035 tests passed. Focused six-file run: 47 tests passed.
- Completed disposable `node /private/tmp/gavel-uiux-run.mjs reset`, followed by `... types` and `... sql`: clean migration/seed and generated types passed; 73 SQL files, 2,167 assertions passed (20 new caption assertions).
- `node /private/tmp/gavel-uiux-run.mjs build`: passed. `... start --port 3152`, `node /private/tmp/gavel-uiux-smoke.mjs B`: production-browser upload/attach caption, reload persistence, clearing and published caption-before-credit rendering passed, with the real public image loaded and no page/console/CSP errors. Standalone smoke fixture import, repeated-fixture insertion and saved-state assertions were corrected before the successful run; no application fixes were needed.
- Fresh task review: spec/quality passed with no Critical/Important findings. Full default browser suite remains a CI gate; human maintainer/screen-reader review remains outstanding.
- Compatibility decision: replace the old six-argument signature with a seven-argument RPC whose caption defaults to null, so existing six-argument calls still resolve. New receipts include caption; null-caption retries also accept the legacy payload hash, preserving pre-deployment in-flight requests. Non-null captions never match legacy hashes. Existing rows and historical snapshots remain valid.

### CI CSP correction across C and D

Initial #91 hosted CI passed 187 browser cases but failed the desktop/mobile editor CSP check. Disposable production reproduction captured `script-src`, blocked URI `eval`, in Zod's `Function("")` capability probe; it caught the exception but still emitted a CSP event. A shared Zod entry disables JIT before tag/guest schemas are constructed. No CSP directive was relaxed. Regression tests for both schemas observed the blocked probe before the fix and zero probes afterward; focused 23 tests and lint passed. Fixes were pushed on their originating C/D branches and merged forward through the stack without rewriting shared history. Final disposable production reproduction returned empty CSP events on both dashboard and new editor, with no console errors. Hosted reruns remain a separate gate.

### Slice E verification

- Completed disposable `node /private/tmp/gavel-uiux-run.mjs reset`, then `... types` and `... sql`: clean migrations/seed and generated types passed; 74 SQL files, 2,231 assertions passed, including 64 new published-photo assertions. Tests cover every upload/attach RPC, actual credited non-owner denial, inactive/ineligible/profile denial, uploader restrictions, administrator success, private unattached assets, current/revision visibility, cleanup retention, exact replay, stale versions, archived denial, and article/homepage/search/sitemap projections.
- `python3 /private/tmp/gavel-uiux-published-photo-race.py`: five real independent-session lock waits passed: competing published attachments, archive-first, attach-first versus stale archive then refreshed archive, publish-first versus stale attach, and draft attach-first versus stale publish. Observer queries confirmed version changes remain invisible until commit.
- `node /private/tmp/gavel-uiux-run.mjs db-lint`: completed without schema errors. Warnings: pre-existing unused membership variable; tag loop variable declaration is shadowed/unused. Neither changes behavior.
- `node /private/tmp/gavel-uiux-run.mjs build`: final production build passed. `... start --port 3153`, `node /private/tmp/gavel-uiux-smoke.mjs E`: uploaded/attached a baseline photo with caption, verified public bytes/rendering, uploaded a replacement on the published article, attached it and verified the new public image/figure on the next request. Caption persistence/clear and typed-tag checks also passed. No page/console/CSP errors.
- `node /private/tmp/gavel-uiux-csp.mjs`: dashboard and new editor with typed rich body both produced empty CSP events and no console errors.
- Focused E form tests: 23 passed. First full E unit run exposed one obsolete route assertion expecting published media hidden; updated to require main-photo controls and retain body-upload denial. Focused route/form rerun: 30 passed. Final combined fast checks are recorded below after completion.
- Fresh task review: spec/quality passed, no Critical/Important findings. Full default browser and concurrency suites were not run locally because their fixture helpers target the primary project; the disposable focused browser/race checks above were run instead. CI runs the full suites. Human maintainer security/screen-reader review remains outstanding.

### Final integration review and proof

Fresh whole-stack review found and corrected three integration gaps before the final PR: child-created tags/search results were not registered in the parent validation catalog; recovered contributor row keys could remount an uncertain request when adding another row; and a late tag response could alter a deliberately adopted recovery snapshot. Parent catalog callbacks now register all successful choices without replacing unrelated state; explicit recovery remounts taxonomy and contributor fields using distinct keys. Deferred-response and exact-retry regressions passed. Fixes were pushed onto C/D and merged forward without rewriting shared history.

- Final `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`, and `git diff --check`: passed. Unit result: 151 files, 1,045 tests.
- Final `node /private/tmp/gavel-uiux-run.mjs build`: passed against disposable gavel-p5. `... start --port 3154` and `node /private/tmp/gavel-uiux-smoke.mjs S`: newly created tag AND guest saved together, reopened and remained selected after reload, with no page/console errors.
- Hosted #92/#93 failures were ambiguous contributor E2E selectors matching two same-name fixture people with different slugs. Selectors now use exact fixture name and slug; fixes are pushed and CI reruns are pending at this record.
- #89's sole persistent hosted failure was the desktop body-image cleanup flow waiting for image attachment; retained logs did not contain its error response. Using copied fixtures/config explicitly retargeted to gavel-p5, the failing case passed alone, then all four desktop body-image cases passed in sequence against the production build. Commands: `pnpm exec playwright test --config /private/tmp/gavel-disposable-browser/playwright.config.ts body-images.spec.ts --grep 'unused uploads survive'`, then the same command without `--grep`. The primary project was untouched. Its failed hosted job was rerun; no speculative product change was made.
- Default full browser/concurrency suites remain hosted CI work. Task-specific browser and independent-session race proofs were run locally against the disposable project. Human security/screen-reader review remains outstanding. No PR was merged.
