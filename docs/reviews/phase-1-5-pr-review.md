# Phase 1–5 pull request review

Post-merge code review of every code-changing pull request through #71, recorded on 2026-11-11 against `origin/main` at `9269c86`. Each finding lists where it lives today, how it fails, and a proposed fix. Nothing in this document has been fixed unless its status says so; fixes need their own task branches and the usual verification.

## Method

- Scope: PRs that change code, SQL or CI. Docs-only PRs (#3, #5, #7, #13–#16, #27, #50) were not reviewed. Integration merges were compared with their component PRs: #6 = #4, #30 = #28, #38 = #37, #40 = #39 and #42 = #41 are identical in code; #35 = #33 + #34 and #55 = #51–#54 plus the public media route, and only their deltas were checked.
- Eight read-only review passes ran in parallel by area, each reading the PR's first-parent diff and the current definitions on `origin/main` (later `create or replace` migrations included). Findings already fixed by later work are listed as such.
- The lead reviewer re-read the cited code for every finding below except where noted "not re-checked". No tests, databases or browsers were run for this review; every finding is from static reading. Severity reflects impact if the scenario occurs, not likelihood.
- PRs #65–#70 were reviewed earlier in this session. Their findings are in [Task 21 plan](../superpowers/plans/2026-11-11-public-sitemap-robots.md) (sitemap, PR #70) and [Phase 5 review fixes](../superpowers/plans/2026-11-11-phase-five-review-fixes.md) (#65–#69, PR #71).

## Summary

| #   | PR  | Severity | Status  | Issue                                                                 |
| --- | --- | -------- | ------- | --------------------------------------------------------------------- |
| 1   | #46 | High     | Present | Cleanup ledger never shrinks; permanent deletion disables itself      |
| 2   | #58 | High     | Present | Deactivating a section or profile can take the homepage down          |
| 3   | #1  | Medium   | Present | Email/password signup enabled locally; identity-linking takeover path |
| 4   | #39 | Medium   | Present | Deactivating a member's profile locks them out with no way back       |
| 5   | #29 | Medium   | Present | Image uploads can stick in `uploading` with no cleanup path           |
| 6   | #25 | Medium   | Present | Uncertain save followed by conflict leaves no recovery path           |
| 7   | #25 | Medium   | Present | Image save during editing silently reverts unsaved form edits         |
| 8   | #62 | Medium   | PR #71  | Letters archive self-canonical at two URLs                            |
| 9   | #12 | Low      | Present | Article owners can read editors' private Auth IDs in revisions        |
| 10  | #29 | Low      | Present | Image decode/re-encode runs before any rate limit                     |
| 11  | #31 | Low      | Present | Inserted-then-removed body images are orphaned                        |
| 12  | #31 | Low      | Present | TS and SQL disagree on duplicate image IDs that differ in case        |
| 13  | #25 | Low      | Present | Conflict reload ignores a changed article status                      |
| 14  | #23 | Low      | Present | Invalid link URL blocks saving until an unrelated body edit           |
| 15  | #41 | Low      | Present | Category edits always fail under an inactive section                  |
| 16  | #45 | Low      | Present | Saved contact email can be silently hidden by the public reader       |
| 17  | #57 | Low      | Present | Escape collapses the desktop navigation                               |
| 18  | #62 | Low      | Present | Internal links to letters use the non-canonical address               |
| 19  | #71 | Low      | Open PR | Footer email link still encodes `@`                                   |
| 20  | #1  | Low      | Present | CI actions and gitleaks image pinned by tag, not digest               |
| 21  | #1  | Medium   | Fixed   | Direct membership writes without last-admin guard or audit            |
| 22  | #1  | Low      | Fixed   | Members could rewrite their own profile slug directly                 |
| 23  | #36 | Low      | Fixed   | Audit reader did not require an active admin profile                  |

No issues were found in #2, #4/#6, #8–#11, #17–#22, #24, #26, #28/#30, #32–#35, #37/#38, #43, #44, #47–#49, #51–#56, #59–#61, #63 and #64.

## Findings

### 1. #46 — cleanup ledger never shrinks; permanent deletion disables itself (High)

- **Where:** `supabase/migrations/20261107041200_cleanup_run_lease.sql:20-21` (`get_media_cleanup_backlog`); `src/backend/media/retired-media-cleanup/retired-media-cleanup.ts:69` and `:121` (claim limits 5 and 30); daily cron in `vercel.json`.
- **Issue:** rows in `private.media_cleanup_ledger` and `private.retired_article_ids` are never deleted. Each daily run claims at most 30 keys and 5 prefixes, but the backlog check reports unhealthy whenever any row has gone 7 days without an attempt or has `last_succeeded=false`.
- **Failure:** after roughly 210 retired media keys or 35 deleted articles over the system's life, some row always exceeds 7 days. Every run is unhealthy, `last_healthy_at` stays null, and `delete_archived_article` returns `cleanup_unavailable` permanently. One transient Storage error also blocks deletion for about N/30 days, because failed rows are ordered after older rows.
- **Fix:** count only rows that still need work. Mark or delete a ledger row once its object is confirmed absent, and exclude completed rows from the staleness check. Loop claims within a run until nothing is claimable or a time budget (about 60 s) is spent. Order claims `last_succeeded=false` first. Add a pgTAP case with more than 210 rows that stays healthy.

### 2. #58 — deactivating a section or profile can take the homepage down (High)

- **Where:** `supabase/migrations/20261109090000_homepage_projection_helpers.sql:10, 21, 27, 33` (slot resolution) versus `:63-65, 76` (card map).
- **Issue:** `private.resolve_homepage_slots()` selects curated and fallback articles by `status='published'` only. `private.homepage_card_map` additionally requires an active section and owner, and returns null when the card count differs from the requested IDs, which makes `get_public_homepage` return `unavailable`. A selected article whose main image is not finalized takes the same null path.
- **Failure:** an administrator deactivates a section or contributor whose published article is the newest story or a saved pick. The homepage shows "temporarily unavailable" and the footer's Read This disappears on every public page, because the public layout uses the same RPC.
- **Fix:** add `join public.sections s on s.id=a.section_id and s.active join public.profiles p on p.id=a.owner_profile_id and p.active` to the curated loop and all three fallback queries, so ineligible picks fall through to the next story. Add pgTAP cases for an inactive owner and an inactive section in a curated slot and as the newest fallback.

### 3. #1 — email/password signup enabled locally; identity-linking takeover path (Medium)

- **Where:** `supabase/config.toml:177, 222, 227`; `supabase/migrations/20261018010000_identity_eligibility.sql:15-18`; `src/backend/auth/access/access.ts:23-26`.
- **Issue:** email signup is enabled with confirmations off, so new email users are confirmed automatically. Eligibility accepts any user whose provider list contains `google`, regardless of other identities.
- **Failure:** an attacker signs up with `victim@bc.edu` and a password. When the victim later signs in with Google, Supabase links the Google identity to the attacker's user. After an administrator approves the membership, the attacker can sign in with the password and pass both the app and database checks. The real risk depends on hosted Auth settings, which this repository does not show; `docs/deployment.md` does not say to disable email signup.
- **Fix:** set `[auth.email] enable_signup = false` (or disable the email provider) and require the same in hosted projects in `deployment.md`. As defense in depth, require a Google identity in `auth.identities` with a matching email and reject users who also have an `email` identity, or check that the session's `amr` is OAuth.

### 4. #39 — deactivating a member's profile locks them out with no way back (Medium)

- **Where:** `supabase/migrations/20261106020500_profile_admin_eligibility_fix.sql:95`; `supabase/migrations/20261106010100_membership_operations.sql:76`; `supabase/migrations/20261106010300_membership_directory_coalesce_fix.sql:34`.
- **Issue:** `manage_contributor_profile` can deactivate a profile linked to a member account. Since `20261109010100`, an inactive profile blocks all dashboard and admin access, but the membership stays active, no membership audit event is written, and no operation reactivates a profile. Re-approval returns `conflict` while the profile is inactive.
- **Failure:** an administrator deactivates a member's linked profile from the contributors page. The member is locked out permanently, the members page still shows them as active, and only manual SQL can restore access.
- **Fix:** reject deactivation of a profile linked to an active membership and direct the administrator to `deactivate_membership`, or add an audited reactivate operation. Show profile state in `list_membership_candidates` so a locked-out member is visible.

### 5. #29 — image uploads can stick in `uploading` with no cleanup path (Medium)

- **Where:** `supabase/migrations/20261103020200_body_image_retention.sql:18`; `supabase/migrations/20261109010000_trusted_media_actor_locks.sql:36-42, 71-73`; `src/app/api/articles/[id]/media/[assetId]/route.ts:133-134, 149-152`.
- **Issue:** after `begin_article_image_upload` marks an asset `uploading`, only a successful finalize moves it on. Removal rejects `uploading`, nothing expires the claim, and the route turns every refused finalize (`conflict`, `forbidden`, `not_found`) into 503 because the receipt fails to parse, which the client treats as "retry the same file".
- **Failure:** the article is published between claim and finalize, or the user retries with a different file after a lost response (hash mismatch returns 409). Cleanup is refused because the asset is still `uploading`, the UI loops on retry, and the asset row and private object stay until the article is eventually deleted.
- **Fix:** map refused finalize codes to 409/403/404 and keep 503 for transport errors. Allow removal to reclaim an `uploading` asset whose claim is older than a fixed window, or reset it to `pending` and delete the object on hash mismatch.

### 6. #25 — uncertain save followed by conflict leaves no recovery path (Medium)

- **Where:** `src/frontend/features/articles/draft-save-state/draft-save-state.ts:108-122, 156-164`; `src/frontend/features/articles/components/draft-form/draft-form.tsx:227-235`.
- **Issue:** after an `unavailable` save, later failures keep `pending` and phase `uncertain`. The recovery panel renders only when nothing is pending, and `reload` refuses while pending. `save_article_draft` checks the receipt before the version, so a non-replay `conflict` on retry proves the original request never committed.
- **Failure:** a save response is lost, another tab saves a newer version, and every retry returns `conflict`. The review panel never appears and lifecycle controls stay disabled; leaving the page discards local edits.
- **Fix:** in `resolve`, when `state.uncertain` and the code is `conflict`, `request_conflict` or `not_found`, clear `pending`/`uncertain` and set phase `conflict`. Add a reducer test for uncertain → conflict.

### 7. #25 — image save during editing silently reverts unsaved form edits (Medium, not reproduced)

- **Where:** `src/frontend/features/articles/components/draft-form/draft-form.tsx:335-341` (`onCommit` calls `command.reload(command.draft, …)`); `src/frontend/features/articles/components/article-media/article-media.tsx:169`; `draft-save-state.ts:156-165`. The fieldset (`draft-form.tsx:268-271`) is not disabled during an image write.
- **Issue:** `onCommit` runs after the image write with the `command` captured when it started, and `reload` rebuilds all state from that snapshot. This was introduced with the main-image integration rather than #25's original code.
- **Failure:** the user attaches an image, edits the title or body while "Saving image…" shows, and the write succeeds. The form reverts to the earlier values and is marked clean, so the edits are lost without a navigation warning.
- **Fix:** add a reducer event that advances only the article id/version/updatedAt and keeps current and acknowledged input, and use it from `onCommit`. Alternatively, disable the fieldset and Save while an image write is in flight.

### 8. #62 — letters archive self-canonical at two URLs (Medium, fixed by open PR #71)

- **Where:** `src/backend/public-articles/public-archive/public-archive.ts:57-60`.
- **Issue and failure:** `/sections/<letters-slug>` renders the letters archive with its own canonical and pagination, duplicating `/letters`.
- **Fix:** merge PR #71, which gives the letters section the `/letters` href for both route shapes.

### 9. #12 — article owners can read editors' private Auth IDs in revisions (Low)

- **Where:** `supabase/migrations/20261021040000_content_history.sql:33`.
- **Issue:** a table-wide SELECT grant on `article_revisions` exposes `actor_user_id` to anyone who can read the article. This contradicts `security-and-permissions.md`, which says Auth links stay inaccessible to clients.
- **Failure:** an administrator edits an author's article; the author queries `article_revisions?select=actor_user_id` through the Data API and receives the administrator's Auth UUID.
- **Fix:** revoke table SELECT and grant `select (id, article_id, created_at, snapshot_version, snapshot)` to authenticated. No application code reads the column. Add a pgTAP denial test.

### 10. #29 — image decode/re-encode runs before any rate limit (Low)

- **Where:** `src/app/api/articles/[id]/media/[assetId]/route.ts:90-99`.
- **Issue:** each POST buffers up to about 10 MiB and fully decodes and re-encodes with sharp (up to 24 MP) before any per-actor limit; only reservation is rate-limited.
- **Failure:** one active member sends many concurrent POSTs against a single reservation and saturates server CPU and memory.
- **Fix:** consume a per-actor attempt before reading the body, and cap concurrent sharp jobs with a small in-process semaphore or `sharp.concurrency`.

### 11. #31 — inserted-then-removed body images are orphaned (Low, not re-checked)

- **Where:** `src/frontend/features/articles/components/draft-editor/draft-body-image-control.tsx:138-175`; `supabase/migrations/20261103020200_body_image_retention.sql:17`.
- **Issue and failure:** after insertion the control forgets the asset ID. If the node is deleted before saving, or the user leaves without saving, the finalized asset has no reference, no UI lists it, and removal works only on drafts. After publishing it stays indefinitely.
- **Fix:** keep inserted asset IDs until a save commits a body containing them and offer removal if absent, or add a sweep for finalized assets with no body, main or revision reference.

### 12. #31 — TS and SQL disagree on duplicate image IDs that differ in case (Low)

- **Where:** `src/shared/articles/draft-contract/draft-contract.ts:165-201` versus `supabase/migrations/20261103020400_body_image_validator_predicates.sql` (`lower(attrs->>'assetId')`).
- **Issue and failure:** two image nodes with the same UUID in different letter case pass the browser validator and fail the database with `invalid_input`. There is no bypass.
- **Fix:** lowercase the ID before `has`/`add` in TypeScript.

### 13. #25 — conflict reload ignores a changed article status (Low, not re-checked)

- **Where:** `src/frontend/features/articles/components/draft-form/draft-form.tsx:246-265`; `src/app/(dashboard)/dashboard/articles/[id]/page.tsx:83-87`.
- **Issue and failure:** if another tab publishes the draft, conflict recovery loads the published detail but keeps the draft save action. Every later save conflicts again and each reload discards re-entered edits.
- **Fix:** in `onLoad`, if `detail.status` differs from the rendered status, refresh the page (the form is keyed by status) or tell the user to reopen the article.

### 14. #23 — invalid link URL blocks saving until an unrelated body edit (Low, not re-checked)

- **Where:** `src/frontend/features/articles/components/draft-toolbar/draft-toolbar.tsx:41-55`; `draft-form.tsx:78-84, 318-321`.
- **Issue and failure:** an invalid link URL is reported through the editor-failure channel, which clears only on a body update. Correcting the URL does not clear it, so Save stays blocked with "Body needs attention".
- **Fix:** keep link URL validation local to the toolbar field, or clear the editor failure when the URL changes or a valid link is applied.

### 15. #41 — category edits always fail under an inactive section (Low)

- **Where:** `supabase/migrations/20261106030100_taxonomy_admin_operations.sql:48`.
- **Issue and failure:** section deactivation leaves categories active, and every category update sends `p_active=true`. The check rejects that under an inactive section even when the category's state is unchanged, so renames and reorders always return `conflict`.
- **Fix:** require an active parent only when activating: `if p_active and not current_active and not section_row.active then conflict`.

### 16. #45 — saved contact email can be silently hidden (Low, not re-checked)

- **Where:** `supabase/migrations/20261107030000_site_information.sql:43` and `src/shared/site-information/site-information/site-information-command.ts` versus `supabase/migrations/20261109040000_public_site_navigation.sql:31-36`.
- **Issue and failure:** save accepts addresses the public projection rejects (local part over 64 characters, leading/trailing/double dots, hyphen-edged or long domain labels). The save succeeds but the footer and information pages show no email.
- **Fix:** share one SQL email predicate between save and public read, and make the Zod rule match it so bad input fails at save time.

### 17. #57 — Escape collapses the desktop navigation (Low, not re-checked)

- **Where:** `src/frontend/components/site/reader-navigation/reader-navigation.tsx:33-43`.
- **Issue and failure:** Escape closes the nearest open `details`, including the outer menu that is meant to stay open on wide screens. A desktop keyboard user loses the primary navigation until they activate Menu.
- **Fix:** skip closing the outer menu when `(min-width: 45rem)` matches, or close only nested category disclosures on wide screens.

### 18. #62 — internal links to letters use the non-canonical address (Low)

- **Where:** `src/frontend/components/site/reader-navigation/reader-navigation.tsx:59`, `site-footer/site-footer.tsx:34`, and the reader article card, home hero, home section, article header, archive header and category chips components.
- **Issue and failure:** every internal section link builds `/sections/<slug>`, including for letters. Once #71 lands, internal navigation leads readers and crawlers to the non-canonical URL.
- **Fix:** add a shared `sectionHref(section)` that returns `/letters` for the approved letters label (moving the label predicate into shared code) and use it in those components.

### 19. #71 — footer email link still encodes `@` (Low, open PR)

- **Where:** `src/frontend/components/site/site-footer/site-footer.tsx:53`; tests in `site-header.test.tsx:64, 89`.
- **Issue and failure:** #71 fixed the email link on the information pages only; the footer on every public page still produces `mailto:editor%40bc.edu`.
- **Fix:** move the `mailto()` helper into shared reader code, use it in the footer, and update the tests. Best done in PR #71 together with finding 18.

### 20. #1 — CI actions and gitleaks image pinned by tag (Low)

- **Where:** `.github/workflows/ci.yml:26, 30, 39, 50`.
- **Issue and failure:** a moved or compromised upstream tag would run attacker code in CI. Impact is limited by read-only permissions, but results such as the secret scan could be falsified.
- **Fix:** pin each action to a commit SHA with a version comment and the gitleaks image by digest, and let Renovate or Dependabot update them.

### 21–23. Fixed by later work

- **#1, medium:** authenticated users had direct membership writes with no last-admin guard, audit or trusted `approved_by`. Fixed by `20261106010100_membership_operations.sql` (checked RPCs). Hosted databases need that migration chain applied.
- **#1, low:** members could update their own profile slug directly. Fixed by `20261106020100_contributor_profile_operations.sql` (update revoked, checked RPCs).
- **#36, low:** the article audit reader checked only `is_active_administrator()`. Fixed by `20261109010100_active_profile_reads.sql`, which requires an active linked profile.

## Suggested order

1. Findings 1 and 2: both disable core features through normal use.
2. Finding 3 before any hosted Auth configuration is finalized, and finding 4.
3. Findings 5–7 together as one editor/media reliability task.
4. Findings 18 and 19 in PR #71 before it merges.
5. The remaining low findings as small follow-ups.
