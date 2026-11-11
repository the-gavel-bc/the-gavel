# Phase 1–5 pull request review

Post-merge code review of every code-changing pull request through #71, recorded on 2026-11-11 against `origin/main` at `9269c86`. Each finding lists where it lives today, how it fails, and a proposed fix. Nothing in this document has been fixed unless its status says so; fixes need their own task branches and the usual verification.

## Method

- Scope: PRs that change code, SQL or CI. Docs-only PRs (#3, #5, #7, #13–#16, #27, #50) were not reviewed. Integration merges were compared with their component PRs: #6 = #4, #30 = #28, #38 = #37, #40 = #39 and #42 = #41 are identical in code; #35 = #33 + #34 and #55 = #51–#54 plus the public media route, and only their deltas were checked.
- Eight read-only review passes ran in parallel by area, each reading the PR's first-parent diff and the current definitions on `origin/main` (later `create or replace` migrations included). Findings already fixed by later work are listed as such.
- The lead reviewer re-read the cited code for every finding below except where noted "not re-checked". No tests, databases or browsers were run for this review; every finding is from static reading. Severity reflects impact if the scenario occurs, not likelihood.
- PRs #65–#70 were reviewed earlier in this session. Their findings are in [Task 21 plan](https://github.com/dylandrozario/the-gavel/blob/feat/public-sitemap-robots/docs/superpowers/plans/2026-11-11-public-sitemap-robots.md) (sitemap, PR #70) and [Phase 5 review fixes](https://github.com/dylandrozario/the-gavel/blob/fix/phase5-review-findings/docs/superpowers/plans/2026-11-11-phase-five-review-fixes.md) (#65–#69, PR #71).

## Original review summary

This table records the original pass. Later supplements below correct reachability, provenance and proposed fixes; they do not certify open PRs as merged.

| #   | PR  | Severity | Status  | Issue                                                                 |
| --- | --- | -------- | ------- | --------------------------------------------------------------------- |
| 1   | #46 | High     | Present | Cleanup ledger never shrinks; permanent deletion disables itself      |
| 2   | #58 | Low      | Present | Ineligible stored selections can make the homepage unavailable        |
| 3   | #1  | Medium   | Present | Email/password signup enabled locally; identity-linking takeover path |
| 4   | #39 | Medium   | Present | Deactivating a member's profile locks them out with no way back       |
| 5   | #29 | Medium   | Present | Image uploads can stick in `uploading` with no cleanup path           |
| 6   | #25 | Medium   | Present | Uncertain save followed by conflict leaves no recovery path           |
| 7   | #29 | Medium   | Present | Image save during editing silently reverts unsaved form edits         |
| 8   | #62 | Medium   | PR #71  | Letters archive self-canonical at two URLs                            |
| 9   | #12 | Low      | Present | Article owners can read editors' private Auth IDs in revisions        |
| 10  | #29 | Low      | Present | Image decode/re-encode runs before any rate limit                     |
| 11  | #31 | Low      | Present | Inserted-then-removed body images are orphaned                        |
| 12  | #31 | Low      | Present | TS and SQL disagree on duplicate image IDs that differ in case        |
| 13  | #32 | Low      | Present | Conflict reload ignores a changed article status                      |
| 14  | #23 | Low      | Present | Invalid link URL blocks saving until an unrelated body edit           |
| 15  | #41 | Low      | Present | Active-category edits fail under an inactive section                  |
| 16  | #45 | Low      | Present | Saved contact email can be silently hidden by the public reader       |
| 17  | #57 | Low      | Present | Escape collapses the desktop navigation                               |
| 18  | #62 | Low      | Present | Internal links to letters use the non-canonical address               |
| 19  | #71 | Low      | Open PR | Footer email link still encodes `@`                                   |
| 20  | #1  | Low      | Present | CI actions and gitleaks image pinned by tag, not digest               |
| 21  | #1  | Medium   | Fixed   | Direct membership writes without last-admin guard or audit            |
| 22  | #1  | Low      | Fixed   | Members could rewrite their own profile slug directly                 |
| 23  | #36 | Low      | Fixed   | Audit reader did not require an active admin profile                  |

The original pass reported no additional issues in #2, #4/#6, #8–#11, #17–#22, #24, #26, #28/#30, #33–#35, #37/#38, #43, #44, #47–#49, #51–#56, #59–#61, #63 and #64.

## Findings

### 1. #46 — cleanup ledger never shrinks; permanent deletion disables itself (High)

- **Where:** `supabase/migrations/20261107041200_cleanup_run_lease.sql:20-21` (`get_media_cleanup_backlog`); `src/backend/media/retired-media-cleanup/retired-media-cleanup.ts:69` and `:121` (claim limits 5 and 30); daily cron in `vercel.json`.
- **Issue:** rows in `private.media_cleanup_ledger` and `private.retired_article_ids` are never deleted. Each daily run claims at most 30 keys and 5 prefixes, but the backlog check reports unhealthy whenever any row has gone 7 days without an attempt or has `last_succeeded=false`.
- **Failure:** after roughly 210 retired media keys or 35 deleted articles over the system's life, some row always exceeds 7 days. Every run is unhealthy, `last_healthy_at` stays null, and `delete_archived_article` returns `cleanup_unavailable` permanently. One transient Storage error also blocks deletion for about N/30 days, because failed rows are ordered after older rows.
- **Fix (corrected to preserve the accepted contract):** retain the permanent registry and ledger so late uploads are removed by recurring sweeps. Process bounded multiple batches with fair progress for both prefixes and keys, prioritize failed work, and verify revisit capacity against the seven-day health threshold. Do not delete or permanently exclude successful rows. PR #74 proposes additional capacity but has a starvation issue recorded as finding 28 below.

### 2. #58 — ineligible stored selections can make the homepage unavailable (Low, defense in depth)

- **Where:** `supabase/migrations/20261109090000_homepage_projection_helpers.sql:10, 21, 27, 33` (slot resolution) versus `:63-65, 76` (card map).
- **Issue:** `private.resolve_homepage_slots()` selects curated and fallback articles by `status='published'` only. `private.homepage_card_map` additionally requires an active section and owner, and returns null when the card count differs from the requested IDs, which makes `get_public_homepage` return `unavailable`. A selected article whose main image is not finalized takes the same null path.
- **Failure prerequisite (corrected by the comprehensive review):** privileged SQL, legacy/imported inconsistent data, or another bypass leaves a published selected article with an inactive section or owner. Current checked administrator operations refuse deactivation while published or archived references exist (`20261106030100_taxonomy_admin_operations.sql:37-39`, `20261106020500_profile_admin_eligibility_fix.sql:72-77`); ordinary successful dashboard deactivation is not a demonstrated trigger. The homepage shows "temporarily unavailable" and the footer's Read This disappears on every public page, because the public layout uses the same RPC.
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

### 7. #29 — image save during editing silently reverts unsaved form edits (Medium, not reproduced)

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

### 13. #32 — conflict reload ignores a changed article status (Low, not re-checked)

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

1. Finding 1 disables deletion through normal accumulated use. Finding 2 is lower-priority defense in depth for inconsistent stored state.
2. Finding 3 before any hosted Auth configuration is finalized, and finding 4.
3. Findings 5–7 together as one editor/media reliability task.
4. Findings 18 and 19 in PR #71 before it merges.
5. The remaining low findings as small follow-ups.

## Independent follow-up review — 2026-11-10

This supplement preserves the original review above and reconciles it with the open follow-up PRs. The original record uses 2026-11-11; this supplement uses the workspace date. Review baseline: application `9269c86`, review document `bc87566`, and the exact pending heads below. Three parallel read-only reviewers covered reader UI, backend/SQL, and existing review evidence; the lead independently reviewed editor/media recovery and re-read the new findings. No application changes were made.

Acceptance criteria for this review were to identify the existing record, distinguish pending fixes from merged behavior, and add actionable findings with triggers, evidence and validation requirements. Race safety and retry recovery were explicit review targets. All new findings below are static analysis, not runtime reproductions. Human approval and hosted verification remain separate gates.

### Existing findings and pending fixes

GitHub reported all these PRs **open** during this review. Their changes are proposals, not fixes present in baseline `9269c86`.

| Findings          | Pending PR and reviewed head                                         | Status clarification                                                                                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                 | [#74](https://github.com/dylandrozario/the-gavel/pull/74), `7b9fed1` | Proposed batched, time-bounded sweeping preserves the permanent ledger. The original suggestion to delete completed ledger rows is superseded by the owner-approved retention requirement recorded in that PR. Real Storage capacity and hosted duration checks remain outstanding. |
| 2                 | [#73](https://github.com/dylandrozario/the-gavel/pull/73), `f7f87d6` | Proposed shared homepage-card eligibility; not merged.                                                                                                                                                                                                                              |
| 3                 | [#75](https://github.com/dylandrozario/the-gavel/pull/75), `9e05c8a` | Proposed Google-only identity eligibility; new finding 24 blocks treating this as complete. Hosted provider configuration remains a manual gate.                                                                                                                                    |
| 4, 9, 15, 16      | [#76](https://github.com/dylandrozario/the-gavel/pull/76), `239cc67` | Proposed profile, revision privacy, taxonomy and email guards; not merged. The PR summary incorrectly calls revision privacy finding 12; the authoritative review number is 9.                                                                                                      |
| 8                 | [#71](https://github.com/dylandrozario/the-gavel/pull/71), `8782128` | Proposed canonical correction; not merged. Findings 18 and 19 remain outside its described changes. New finding 27 concerns its search input change.                                                                                                                                |
| 5–7, 10–14, 17–20 | No merged correction identified                                      | Still present in the reviewed baseline. Findings 21–23 retain their original historical fixed status.                                                                                                                                                                               |

The unit, SQL and build results reported in PR descriptions were read as historical author evidence; this review did not rerun or independently certify them.

### 24. #75 — last-administrator guard counts administrators the new eligibility rule blocks (High, pending-PR regression)

- **Where:** `supabase/migrations/20261106010100_membership_operations.sql:124-143`, especially the administrator count at lines 133–141; compare the new `20261111040000_google_only_identity.sql` on PR #75. The profile administrator count also copies the older provider predicate in `20261106020500_profile_admin_eligibility_fix.sql:81-93`.
- **Trigger:** two active administrators have active profiles and confirmed `bc.edu` addresses. A has only Google; B has both Google and email identities. PR #75 denies B access, but the old administrator count still includes B because its providers contain Google. A then demotes or deactivates their own membership.
- **Impact:** the operation sees two administrators and succeeds, leaving no administrator who can pass the new eligibility check. This needs no concurrent request and survives the proposed PR #76 changes.
- **Fix:** share one user-ID identity eligibility predicate across actor access, target eligibility and administrator counts. Ensure the last-administrator guard counts only administrators who can actually sign in.
- **Required verification:** after applying PR #75, seed the two administrators above; self-demotion and self-deactivation by A must return `conflict`, preserve membership state and write no success audit. Retain a positive case with two Google-only administrators.
- **Related coverage gap:** the locked trusted-media check still calls the weaker `private.eligible_media_actor` provider predicate (`20261102010100_media_finalization.sql:8-11`, `20261109010000_trusted_media_actor_locks.sql:8-12`). The route's earlier access check does not revalidate a provider change during image processing. Reuse the same predicate there and test revocation before finalization; this race has not been reproduced here.

### 25. #29 — upload begin and finalize acquire article and asset locks in opposite order (Medium)

- **Where:** `supabase/migrations/20261109010000_trusted_media_actor_locks.sql:32-36` and `:62-64`.
- **Trigger:** a retry of `begin_article_image_upload` holds the article row and waits for the asset while a concurrent finalization holds that asset and waits for the article. Both operations can pass the shared actor locks.
- **Impact:** the transactions form a deadlock. PostgreSQL aborts a participant, exposing an avoidable unavailable response during upload recovery. Finalization catches the database error and returns `unavailable`; this compounds existing finding 5 rather than establishing permanent corruption.
- **Fix:** read the asset's article ID without a row lock, then lock and recheck article and asset in the same order as begin/removal. Preserve authorization revalidation after lock waits.
- **Required verification:** use independent sessions and barriers to overlap retry-begin and finalize on one asset; both operations should finish without a deadlock and leave a consistent finalized asset. Also retain demotion, profile-deactivation and membership-revocation denial cases.

### 26. #29 — editing main-image metadata after an uncertain write prevents retrying the stored command (Medium)

- **Where:** `src/frontend/features/articles/components/article-media/article-media.tsx:120-142`, `:263-277`, and `:281-286`.
- **Trigger:** attach an image or update its metadata and receive `unavailable` or lose the response. The component retains `pendingWrite`, but its alt-text and credit inputs become editable again. Change either value and press Attach/Update.
- **Impact:** `commit` rejects the new values before sending the retained request. There is no explicit action to retry the stored payload; the user must reconstruct its exact metadata or reload and abandon local state. Removing an image also fails the payload equality check when an attach is pending. Pending media keeps lifecycle controls disabled.
- **Fix:** provide a retry action that submits the complete stored command independently of current field values. Freeze pending metadata or keep newer edits separately. Retain the original expected version together with the request ID and payload.
- **Required verification:** lose an attachment response, change alt text and credit, then retry the original command. Assert identical request ID, version and payload, successful receipt recovery, and preservation of newer local edits.

### 27. #71 — search input limit rejects supported supplementary Unicode queries (Low, pending-PR regression)

- **Where:** `src/frontend/features/reader/components/search-form/search-form.tsx:31` on PR #71 (`maxLength={160}`); contract in `src/shared/reader/public-search/public-search.ts:22` and its existing 160-emoji test at `public-search.test.ts:27`.
- **Trigger:** type or paste supported supplementary Unicode text into the search input. HTML maxlength counts UTF-16 code units, while normalization counts code points. For example, 81 supplementary characters exceed the new HTML limit despite using only 81 code points. This establishes an input/normalization mismatch; emoji-only normalization acceptance does not prove a valid SQL search, which also requires searchable terms. Use supplementary-letter words within the SQL lexeme bounds for the end-to-end regression.
- **Impact:** the input truncates an otherwise supported query after 80 such characters. This mismatch is introduced by PR #71; baseline `maxLength={320}` accommodates the full supported range.
- **Fix:** keep the 320-code-unit ceiling with contract validation, or enforce a separate code-point limit without truncating valid supplementary characters.
- **Required verification:** browser input coverage should preserve and submit 160 supplementary characters, accept 160 BMP characters, and give appropriate feedback above the contract limit.

### Follow-up priority and proof limits

Resolve finding 24 before merging PR #75. Handle findings 25 and 26 with the existing editor/media reliability findings 5–7. Correct finding 27 in PR #71. No finding in this supplement is marked fixed.

This was a documentation-only review. GitHub PR metadata and local source/ref reads ran successfully. No unit, SQL, concurrency, browser or build suite ran. Runtime verification remains work for the implementation branches under the documented Node 22 toolchain. The document passed targeted Prettier formatting and a trailing-whitespace check; application tests were not required for this documentation-only change.

## Comprehensive security, correctness and performance review — 2026-11-10

### Scope, plan and acceptance

The follow-up requested every PR, including security and optimization opportunities. GitHub inventory contains **76 PRs: #1–#69 merged and #70–#76 open**. Application baseline is `9269c86`; open PRs were reviewed at the heads in the ledger below. No branch was switched, no application behavior was changed, and no GitHub comment, approval or PR mutation was made.

Three parallel passes covered #1–#26, #27–#50 and #51–#76. The lead reconciled the reports, re-read new findings and optimization call paths, independently reran the two new reproductions, and checked coverage. Merged review used first-parent merge diffs; open review used the current main-to-head changes. Integration duplicates were compared with their component changes. Production code received static review; generated types, lockfile entries, large fixtures and repetitive assertions were sampled. “Reviewed” does not mean every line or runtime path was executed.

Acceptance criteria were: account for every inventory PR; check current replacements before calling a historical problem present; separate bugs from unmeasured improvements; retain explicit ownership/role denials, lock ordering, retry and conflict recovery in proposed validation; and give each actionable item a location, trigger, fix and proof requirement. The ledger meets the coverage criterion. Runtime and hosted gates below remain incomplete.

### Corrections to earlier review conclusions

- **Finding 2 is Low / defense in depth.** Supported contributor and taxonomy deactivation operations reject published/archived references. The original normal-admin outage scenario was overstated; inconsistent privileged/legacy state is the demonstrated prerequisite.
- **Finding 1 must preserve permanent tombstones.** Removing successful cleanup entries violates the approved recurring cleanup guarantee against late uploads. Its proposed fix above is corrected.
- **Finding provenance:** image-write edit loss (7) belongs to #29; stale status after recovery (13) belongs to the #32 published-editor integration. The original reducer/recovery work in #25 is related but did not introduce these later integrations.
- **Finding 27 has separate normalization and SQL gates.** Emoji-only input is not proof of a valid database search. The UTF-16 input mismatch remains; an end-to-end fixture must include searchable supplementary-letter terms.
- A suspected publish form lock was rejected because the form is already keyed by article ID and status. The owner-approved restriction of #76 to active linked memberships was retained rather than reported as a new bug.

### 28. #74 — prefix scans can repeatedly starve object deletion (Medium, pending-PR regression)

- **Where:** `src/backend/media/retired-media-cleanup/retired-media-cleanup.ts:76,123-135` at open head `7b9fed1`; `supabase/migrations/20261111030000_cleanup_sweep_capacity.sql` makes permanent prefixes eligible again on subsequent runs.
- **Trigger:** prefix scanning consumes the shared 40-second budget before the key loop starts, through enough batches or slow Storage listing. The next run revisits the permanent prefixes and can consume the whole budget again.
- **Impact:** known retired objects receive no deletion attempt even across repeated sweeps. Stale keys keep cleanup unhealthy and block administrator deletion. This is starvation of one work class, beyond merely incomplete total backlog processing.
- **Evidence:** the actual proposed worker was transpiled and executed with mocked RPC/Storage and a controlled clock. One prefix listing advances the clock by 41 seconds. Two runs produced `prefixCalls:1,keyCalls:0` and `prefixCalls:2,keyCalls:0`; both returned `{ok:false}`. No live Storage or database was involved. The lead reran the reproduction.
- **Fix:** interleave prefix and key batches or reserve separate bounded progress budgets. Preserve claim fencing, permanent tombstones, failure reporting and authorization.
- **Required validation:** use enough normal-latency batches to exhaust the prefix allocation and prove at least one key batch progresses in each run. Repeat across runs and test failed claims, expired leases and late recreated objects. Hosted capacity remains unmeasured.
- **Reproduction:** from the repository under Node 22, run `node docs/reviews/reproductions/cleanup-budget.mjs`. It reads exact PR #74 source from Git and asserts the failure; it requires that Git object and installed project dependencies.

### 29. #39 / #40 — unchanged contributor save disables controls until a full reload (Low)

- **Where:** `src/frontend/features/contributors/components/admin-contributors/contributor-controls.tsx:37-40,55-65`; parent key at `src/app/(dashboard)/dashboard/admin/contributors/page.tsx:79`; no-op handling at `supabase/migrations/20261106020500_profile_admin_eligibility_fix.sql:60-70`.
- **Trigger:** save an active contributor without changing its name or biography. The checked operation returns success with `changed:false` and the same version. The success latch sets `blocked`, and `router.refresh()` returns the same ID/version/active key, preserving the blocked client state.
- **Impact:** fields, Save and Deactivate stay disabled until a full reload. This is a UI availability bug, not an authorization bypass.
- **Evidence:** a JSDOM/React reproduction executed the actual component with a mocked no-op action and refresh. Output was `beforeDisabled:false,afterSameVersionRefreshDisabled:true,refreshes:1`. The lead independently ran it; no browser, database or network was involved.
- **Fix:** clear the success latch when `changed:false`, following `TaxonomyControls`, or reconcile the acknowledged state without blocking every successful result.
- **Required validation:** save unchanged fields, rerender with refreshed same-version props, then change and save again. Controls must stay usable; changed saves must still adopt fresh versions, and role/ownership denials must retain input.
- **Reproduction:** from the repository under Node 22, run `node docs/reviews/reproductions/contributor-noop.mjs`. It asserts the historical failure against the current component, using installed React, JSDOM and TypeScript dependencies. After the no-op fix it exits nonzero because the formerly stuck controls are enabled; normal regression coverage verifies the corrected behavior.

### Performance opportunities, separate from bugs

These are evidenced redundant operations or index candidates, not measured speedups. No new service, dependency or broad cache is proposed. Benchmark before implementation and preserve fresh authorization/publication checks.

| ID  | Location / originating PRs                                                                                               | Evidence and proposed change                                                                                                                                                                                                                                                                                          | Acceptance and measurement                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | `src/backend/articles/draft-queries/draft-queries.ts:189`; edit page `:67`; `draft-reload-action.ts:20-26` (#20/#23/#25) | Detail loads sections, categories, tags and profiles, then edit/recovery loads all four again. `loadDraftOptions` paginates each catalog in 500-row batches. Share the already loaded options inside one authorized request instead of fetching a second copy.                                                        | For nonempty sections below a page boundary, remove at least four duplicate Data API reads per editable load/review. Preserve unavailable-selection repair, independent action checks and user isolation. Measure request counts and latency; do not persist private catalogs in shared caches. |
| O2  | `src/frontend/features/articles/draft-save-state/draft-input-key.ts:15-23`; `draft-editor.tsx:44,118-142` (#23/#25)      | Every metadata edit recursively sorts/serializes the full body for its dirty key. Each native body change is also converted back to editor data before the emitted-echo shortcut. Reuse a body key while body identity is unchanged and skip redundant echo conversion.                                               | Profile bounded 1 MiB / 5,000-node fixtures before/after. Preserve immediate-submit snapshots, PostgreSQL key semantics, delayed-echo handling and invalid-native warnings. No typing-latency improvement is claimed yet.                                                                       |
| O3  | `src/app/(public)/layout.tsx:13-22`; `20261109090100_public_homepage.sql:16-27` (#58/#59)                                | Every public route composes and validates the full homepage to obtain only four footer Read This cards. At the supported 100-section bound, composition requests up to 412 card references before deduplication. Add a narrow footer projection sharing the same slot rules; retain full composition on the homepage. | Compare SQL time, rows, response bytes and article/search TTFB at representative 7- and 100-section sizes. Keep request-local memoization, anonymous reads, no-store visibility, fallback ordering and duplicate exclusions. Any interface change needs its own contract update.                |
| O4  | `src/backend/articles/admin-article-queries/admin-article-queries.ts:158-159`; article index migrations (#34)            | Global admin pagination orders by `(updated_at DESC,id DESC)` without a matching composite index. Evaluate that index for broad listings; add a status prefix only if representative filtered queries justify it.                                                                                                     | Run `EXPLAIN (ANALYZE, BUFFERS)` on realistic sizes and test cursor ties. Account for index storage/write overhead and RLS. This is an unmeasured index candidate, not a confirmed production bottleneck.                                                                                       |
| O5  | `.github/workflows/ci.yml:74-77`; `playwright.config.ts:26-34` (#1 and later test integration)                           | CI runs `pnpm build`, then Playwright starts with another `pnpm build`. Consolidate on one production build for browser verification. The two current builds use different environment values, so remove duplication only after selecting one explicit local test build environment.                                  | Preserve a real production-build gate and ensure E2E uses that exact artifact with matching public environment values. Compare total CI duration; do not reuse an artifact built for another origin or database.                                                                                |

### Security hardening and verification backlog

These items consolidate existing findings and documented launch controls; they are not additional confirmed vulnerabilities.

1. **Identity eligibility consistency, before #75 merges:** finding 24 needs one user-ID eligibility predicate reused in actor access, target approval, last-eligible-admin counts and trusted-media revalidation. Keep Auth/membership/profile locks and test mixed-provider denials and revocation during lock waits. Audit the deployed provider configuration separately; the historical account-linking takeover scenario has not been reproduced here.
2. **Upload resource admission:** finding 10 remains in the baseline. Admit/rate-limit attempts before multipart buffering and Sharp processing, with bounded concurrent work. A reservation rate limit alone does not limit repeated POSTs to one asset. Preserve exact retry behavior and use measured concurrency/memory budgets rather than an arbitrary new service.
3. **Browser controls required by the existing security document:** `next.config.ts:10-22` configures robots headers but no CSP, frame protection, referrer policy or permissions policy. The repository does not demonstrate deployment-level enforcement of the planned controls. Add and verify a tested policy for production documents/private routes, including direct nested-route responses and normal OAuth/editor behavior; verify HTTPS/HSTS at the real deployment. This is an unimplemented defense-in-depth/launch-verification item, not proof that a hosted header is absent or an exploit exists.
4. **CI supply chain:** existing finding 20 recommends immutable action SHAs and image digests, preserving read-only permissions and reviewed automated updates. No dependency audit or upstream compromise investigation ran in this pass.
5. **Accepted constraints remain visible:** global search quota/serialization (ADR 0011), the five-minute public-image cache lifetime, the sitemap budget, and the matched-resource no-JavaScript 404 blocker are documented decisions or existing release gates. They were not reclassified as new bugs. Human security/accessibility review, hosted provider checks, cleanup capacity/alerts and backup recovery remain outstanding.

### Complete PR coverage ledger

Revision is the first-parent merge commit for merged PRs and exact reviewed head for open PRs. “No additional finding” means none substantiated in this pass; it does not certify the absence of bugs. Historical fixes and proposed open fixes are not conflated.

| PR                                                        | State / revision | Reviewed scope and outcome                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#1](https://github.com/dylandrozario/the-gavel/pull/1)   | merged `9dcd79b` | Foundation application, auth/session/proxy, environment/client boundaries, identity/RLS migrations, CI and security configuration; existing identity-provider and mutable-CI-ref findings remain. Later migrations close original direct membership/profile writes.                                    |
| [#2](https://github.com/dylandrozario/the-gavel/pull/2)   | merged `66f2f82` | Audit workflow exception and configuration/documentation delta; temporary ignore removed by #23. No current exception inferred from historical PR.                                                                                                                                                     |
| [#3](https://github.com/dylandrozario/the-gavel/pull/3)   | merged `a3bb502` | Docs-only, changed-path list verified; no runtime code.                                                                                                                                                                                                                                                |
| [#4](https://github.com/dylandrozario/the-gavel/pull/4)   | merged `f28ae4e` | Colocation/import/CSS extraction and script target changes; no additional persistent defect identified.                                                                                                                                                                                                |
| [#5](https://github.com/dylandrozario/the-gavel/pull/5)   | merged `9893018` | Docs-only plan, changed-path list verified.                                                                                                                                                                                                                                                            |
| [#6](https://github.com/dylandrozario/the-gavel/pull/6)   | merged `3c1a241` | Integration of #4; identical code delta independently compared via first-parent diff, not counted as new behavior.                                                                                                                                                                                     |
| [#7](https://github.com/dylandrozario/the-gavel/pull/7)   | merged `74ae26a` | Docs-only accepted content contract/schema plan, changed-path list verified.                                                                                                                                                                                                                           |
| [#8](https://github.com/dylandrozario/the-gavel/pull/8)   | merged `bfa73d8` | Taxonomy schema, constraints, public/administrator policies and types; no additional defect identified.                                                                                                                                                                                                |
| [#9](https://github.com/dylandrozario/the-gavel/pull/9)   | merged `7aa8bfc` | Article storage/scalar constraints and private ownership/admin read predicate; later active-profile read correction checked in `20261109010100_active_profile_reads.sql`.                                                                                                                              |
| [#10](https://github.com/dylandrozario/the-gavel/pull/10) | merged `86cec28` | Composite article/category FKs, reverse index and association RLS; no additional defect identified.                                                                                                                                                                                                    |
| [#11](https://github.com/dylandrozario/the-gavel/pull/11) | merged `aad0d4a` | Tag/credit joins, restrictive references and read policies; no credit-derived authority found.                                                                                                                                                                                                         |
| [#12](https://github.com/dylandrozario/the-gavel/pull/12) | merged `aaa4226` | Protected revision/audit storage and grants; existing revision-actor UUID disclosure independently confirmed.                                                                                                                                                                                          |
| [#13](https://github.com/dylandrozario/the-gavel/pull/13) | merged `bb86c0e` | Docs-only verification record, changed-path list verified.                                                                                                                                                                                                                                             |
| [#14](https://github.com/dylandrozario/the-gavel/pull/14) | merged `5414314` | Docs-only handoff adjustment, changed-path list verified.                                                                                                                                                                                                                                              |
| [#15](https://github.com/dylandrozario/the-gavel/pull/15) | merged `5e6f76b` | Docs-only draft proposal, changed-path list verified.                                                                                                                                                                                                                                                  |
| [#16](https://github.com/dylandrozario/the-gavel/pull/16) | merged `ec4554a` | Docs-only accepted draft contract/plan/ADR, changed-path list verified.                                                                                                                                                                                                                                |
| [#17](https://github.com/dylandrozario/the-gavel/pull/17) | merged `349c162` | TS JSON/link/document/input validators and SQL equivalents, CI parity entry; large JSON fixture records sampled. No new confirmed validator bypass.                                                                                                                                                    |
| [#18](https://github.com/dylandrozario/the-gavel/pull/18) | merged `1d5e922` | Quota/receipt schema, actor/reference locks, hash/snapshot/create functions, concurrency harness; later create replacements consulted. No new confirmed atomicity bypass.                                                                                                                              |
| [#19](https://github.com/dylandrozario/the-gavel/pull/19) | merged `ad36c7b` | Expected-version/no-op/replay save operation and concurrency fixtures; later save replacements consulted. No new confirmed authority bypass.                                                                                                                                                           |
| [#20](https://github.com/dylandrozario/the-gavel/pull/20) | merged `5adda73` | Checked actions/results/cursors/list/detail/options and no-store client; duplicate-catalog work traced into later route composition.                                                                                                                                                                   |
| [#21](https://github.com/dylandrozario/the-gavel/pull/21) | merged `52656f8` | Dashboard listing, pagination, error recovery and summary rendering; no new persistent defect identified.                                                                                                                                                                                              |
| [#22](https://github.com/dylandrozario/the-gavel/pull/22) | merged `94eae89` | Create form, command controller, metadata validation and fields; superseding #25 reducer checked.                                                                                                                                                                                                      |
| [#23](https://github.com/dylandrozario/the-gavel/pull/23) | merged `ecf3d62` | Actual editor/paste/link/translation/extensions, lazy loading and edit route; existing toolbar error-state finding rechecked and duplicate-catalog work identified. Historical default Server Action payload limit has been fixed by current `next.config.ts`.                                         |
| [#24](https://github.com/dylandrozario/the-gavel/pull/24) | merged `3de2b3b` | Category request cancellation/retry, repairable unavailable selections, contributor/taxonomy controls; no new confirmed race beyond existing later integrations.                                                                                                                                       |
| [#25](https://github.com/dylandrozario/the-gavel/pull/25) | merged `c450045` | Reducer/hook, conflict snapshots/reload, navigation provider/guarded links/sign-out, category reseeding and recovery action; uncertain→conflict reducer scenario reproduced. Browser Back/Forward omission is explicitly accepted in plan, not a new defect.                                           |
| [#26](https://github.com/dylandrozario/the-gavel/pull/26) | merged `1285933` | Verification/test/documentation and category-action access-error delta; current action returns safe `forbidden` without redirecting unsaved input. No new persistent defect identified.                                                                                                                |
| [#27](https://github.com/dylandrozario/the-gavel/pull/27) | merged `b35217f` | First-parent path/diff classification; Documentation-only editorial contract; no executable code.                                                                                                                                                                                                      |
| [#28](https://github.com/dylandrozario/the-gavel/pull/28) | merged `707bbb9` | Reviewed generated slug validation, allocator, write/replay compatibility and UI removals; No additional persistent finding.                                                                                                                                                                           |
| [#29](https://github.com/dylandrozario/the-gavel/pull/29) | merged `3b7cda6` | Reviewed media reservation/finalization/removal, route and editor workflow; followed #48 replacements; Existing uploading recovery and admission findings.                                                                                                                                             |
| [#30](https://github.com/dylandrozario/the-gavel/pull/30) | merged `7838b13` | Production-code diff byte-identical to #28, compared programmatically; Duplicate integration, no additional code delta.                                                                                                                                                                                |
| [#31](https://github.com/dylandrozario/the-gavel/pull/31) | merged `ed65dbf` | Reviewed body-image UI, v2 validation, ref storage/writes/retention, GET preview; Existing orphan upload and UUID parity findings.                                                                                                                                                                     |
| [#32](https://github.com/dylandrozario/the-gavel/pull/32) | merged `3fefa1f` | Reviewed published-save RPC, readiness helper, editor/action/query changes; No additional persistent finding.                                                                                                                                                                                          |
| [#33](https://github.com/dylandrozario/the-gavel/pull/33) | merged `d6f4b2e` | Reviewed lifecycle RPC, controls, actor/version/receipt paths; No additional persistent finding; publish-lock candidate rejected.                                                                                                                                                                      |
| [#34](https://github.com/dylandrozario/the-gavel/pull/34) | merged `446b270` | Reviewed admin queries/routes/list, restore SQL/action/UI; Index opportunity; no additional confirmed bug.                                                                                                                                                                                             |
| [#35](https://github.com/dylandrozario/the-gavel/pull/35) | merged `6bae0ca` | First-parent integration compared with #33/#34 production changes; Component integration; no independent finding.                                                                                                                                                                                      |
| [#36](https://github.com/dylandrozario/the-gavel/pull/36) | merged `5109a80` | Reviewed audit UI, reader, cursor and grant changes; Historical active-profile denial gap closed by #48.                                                                                                                                                                                               |
| [#37](https://github.com/dylandrozario/the-gavel/pull/37) | merged `9e41cfd` | Reviewed membership operation/read/audit SQL, actions, controls, directory/cursor; No additional persistent finding.                                                                                                                                                                                   |
| [#38](https://github.com/dylandrozario/the-gavel/pull/38) | merged `4c4d5bc` | Production-code diff byte-identical to #37, compared programmatically; Duplicate integration.                                                                                                                                                                                                          |
| [#39](https://github.com/dylandrozario/the-gavel/pull/39) | merged `ae16537` | Reviewed contributor management/guards/slugs/directory/action/control diff and current final SQL; Existing inactive member lockout; new no-op control lock.                                                                                                                                            |
| [#40](https://github.com/dylandrozario/the-gavel/pull/40) | merged `b20f5f8` | Production-code diff byte-identical to #39, compared programmatically; Duplicate integration.                                                                                                                                                                                                          |
| [#41](https://github.com/dylandrozario/the-gavel/pull/41) | merged `cc14618` | Reviewed taxonomy operation/read/storage and controls/actions; Existing inactive-parent edit restriction, narrowed trigger above.                                                                                                                                                                      |
| [#42](https://github.com/dylandrozario/the-gavel/pull/42) | merged `f3ba763` | Production-code diff byte-identical to #41, compared programmatically; Duplicate integration.                                                                                                                                                                                                          |
| [#43](https://github.com/dylandrozario/the-gavel/pull/43) | merged `64922a2` | Reviewed own-profile RPC/read/action/form and identity-lock replacement; No additional persistent finding.                                                                                                                                                                                             |
| [#44](https://github.com/dylandrozario/the-gavel/pull/44) | merged `7539264` | Reviewed curation storage/write/read/control/catalog/navigation and scoped-delete replacement; No additional persistent finding.                                                                                                                                                                       |
| [#45](https://github.com/dylandrozario/the-gavel/pull/45) | merged `3c92d7c` | Reviewed site information SQL, validation/action/form; Existing email contract mismatch.                                                                                                                                                                                                               |
| [#46](https://github.com/dylandrozario/the-gavel/pull/46) | merged `44a5583` | Reviewed archived deletion, durable cleanup registry/claims/health/current replacement SQL, worker, cron and route; Existing capacity/readiness bug; batching optimization.                                                                                                                            |
| [#47](https://github.com/dylandrozario/the-gavel/pull/47) | merged `cd67443` | Reviewed rename/import diff, mechanically isolated non-import edits and inspected new boundary rule/config; No additional persistent finding.                                                                                                                                                          |
| [#48](https://github.com/dylandrozario/the-gavel/pull/48) | merged `d6b8575` | Reviewed trusted actor locks, active-profile read predicates and UI text; Closes previous authorization gaps; no additional confirmed bug.                                                                                                                                                             |
| [#49](https://github.com/dylandrozario/the-gavel/pull/49) | merged `b7aa564` | Reviewed CI port-selection implementation/workflow; docs classified; No additional confirmed bug.                                                                                                                                                                                                      |
| [#50](https://github.com/dylandrozario/the-gavel/pull/50) | merged `2006cfa` | First-parent path/diff classification; Documentation-only reader contract.                                                                                                                                                                                                                             |
| [#51](https://github.com/dylandrozario/the-gavel/pull/51) | merged `7eef3b1` | Reviewed public article detail allowlist, canonical-document validation, association bounds, public client and adapter. No additional finding.                                                                                                                                                         |
| [#52](https://github.com/dylandrozario/the-gavel/pull/52) | merged `4145d2f` | Reviewed scope filters, bounded pagination, microsecond cursor contract, same-statement card mapping and index. No additional finding.                                                                                                                                                                 |
| [#53](https://github.com/dylandrozario/the-gavel/pull/53) | merged `bfd224d` | Reviewed public site navigation projection, bounded catalogs and unsafe-copy filtering. Existing contact-email mismatch belongs to finding 16 and pending #76.                                                                                                                                         |
| [#54](https://github.com/dylandrozario/the-gavel/pull/54) | merged `e98e089` | Reviewed publication-reference Storage policy, operation restriction, no-store metadata requirement, upload change and maintenance backfill script. Backfill explicitly requires stopped writers/cleanup; no additional finding.                                                                       |
| [#55](https://github.com/dylandrozario/the-gavel/pull/55) | merged `e6a71c0` | Compared against #54 head: shared #51–#54 code is duplicate; reviewed seven-file integration delta adding public media projection, checked download/hash/WebP handling and GET/HEAD route/tests. No additional finding.                                                                                |
| [#56](https://github.com/dylandrozario/the-gavel/pull/56) | merged `92b9fb3` | Reviewed card/meta/pagination primitives, reader layout/styles and browser-safe card contract. No additional finding.                                                                                                                                                                                  |
| [#57](https://github.com/dylandrozario/the-gavel/pull/57) | merged `c6ab801` | Reviewed public shell, responsive disclosure/navigation/footer and focus handling. Existing finding 17, and letters/mailto findings 18–19, retained.                                                                                                                                                   |
| [#58](https://github.com/dylandrozario/the-gavel/pull/58) | merged `3eae841` | Reviewed homepage slot resolution, card-map bounds, same-snapshot projection and adapter. Existing finding 2, with trigger caveat above.                                                                                                                                                               |
| [#59](https://github.com/dylandrozario/the-gavel/pull/59) | merged `b3fc68e` | Reviewed homepage composition, request memoization and footer integration. Performance improvement above; no new correctness/security finding.                                                                                                                                                         |
| [#60](https://github.com/dylandrozario/the-gavel/pull/60) | merged `dec34cd` | Reviewed canonical body renderer, rich-text/link allowlist consumption, bounded recursion/images and private preview reuse. No additional finding.                                                                                                                                                     |
| [#61](https://github.com/dylandrozario/the-gavel/pull/61) | merged `9e08464` | Reviewed public article route, metadata/page memoization, related-story bound, credits and media rendering. No additional finding; pre-existing matched-resource no-JavaScript 404 blocker remains documented.                                                                                         |
| [#62](https://github.com/dylandrozario/the-gavel/pull/62) | merged `97cecf4` | Reviewed section/category/letters resolvers/routes and invalid-cursor recovery. Existing findings 8 and 18 retained.                                                                                                                                                                                   |
| [#63](https://github.com/dylandrozario/the-gavel/pull/63) | merged `adffb17` | Reviewed public tag resolution, exact scoped cursors and archive reuse. No additional finding.                                                                                                                                                                                                         |
| [#64](https://github.com/dylandrozario/the-gavel/pull/64) | merged `711228a` | Reviewed active-only author projection, public biography, owner-or-credit listing and archive metadata reuse. No private identity fields selected; no additional finding.                                                                                                                              |
| [#65](https://github.com/dylandrozario/the-gavel/pull/65) | merged `5039450` | Reviewed canonical search text extraction, immutable lexemes, expression indexes, candidate union and bounded synthetic benchmark script. No additional finding; no fresh SQL/explain benchmark run.                                                                                                   |
| [#66](https://github.com/dylandrozario/the-gavel/pull/66) | merged `b796351` | Reviewed normalization parity, token bounds, direct-RPC transport guard, nontransactional shared quota, timeout/cancellation and safe cards/cursors; inspected HTTP checker. No additional finding beyond accepted global admission tradeoffs.                                                         |
| [#67](https://github.com/dylandrozario/the-gavel/pull/67) | merged `d820f52` | Reviewed search page, form/recovery/results, cursor/retry URLs and disabled search pagination prefetch. Existing no-JavaScript matched-resource 404 release blocker remains.                                                                                                                           |
| [#68](https://github.com/dylandrozario/the-gavel/pull/68) | merged `15e0abd` | Reviewed information pages, text rendering, missing-copy/noindex states and safe configured contact links. Mailto correction pending #71; footer remains separate.                                                                                                                                     |
| [#69](https://github.com/dylandrozario/the-gavel/pull/69) | merged `9840d8a` | Reviewed public metadata allowlisted paths/origin, title/description handling, article authors/media, excluded states, framework configuration and route integration. No additional finding.                                                                                                           |
| [#70](https://github.com/dylandrozario/the-gavel/pull/70) | open `70ac821`   | Reviewed exact main-to-head sitemap/robots changes: SQL page/budget/projection, server assembly, escaped XML, robots prefixes and tests/task decisions. No additional finding outside accepted decisions.                                                                                              |
| [#71](https://github.com/dylandrozario/the-gavel/pull/71) | open `8782128`   | Reviewed exact main-to-head canonical/mailto/maxlength fixes. Existing findings 18, 19 and 27 retained with Unicode fixture caveat.                                                                                                                                                                    |
| [#72](https://github.com/dylandrozario/the-gavel/pull/72) | open `bc87566`   | Docs-only review record/README diff. Reviewed for duplication and evidence status; no runtime code. Workspace supplement is later untracked documentation, not part of this PR head.                                                                                                                   |
| [#73](https://github.com/dylandrozario/the-gavel/pull/73) | open `f7f87d6`   | Reviewed exact shared homepage eligibility predicate/slot fallback migration and regression test changes. Proposed mitigation, not merged; no additional finding.                                                                                                                                      |
| [#74](https://github.com/dylandrozario/the-gavel/pull/74) | open `7b9fed1`   | Reviewed batched worker, per-run claim horizon, ordering/backlog SQL and tests. New prefix/key starvation finding above, reproduced with mocked actual module.                                                                                                                                         |
| [#75](https://github.com/dylandrozario/the-gavel/pull/75) | open `9e05c8a`   | Reviewed Google-only app/SQL predicate, disabled email signup and tests. Existing finding 24 remains; hosted provider configuration unverified.                                                                                                                                                        |
| [#76](https://github.com/dylandrozario/the-gavel/pull/76) | open `239cc67`   | Reviewed active-member profile guard, taxonomy edit guard, shared TS contact-email rule, SQL email predicate/save guard, revision column privileges and focused test changes. No additional finding beyond accepted active-membership scope; existing finding 24 still applies when combined with #75. |

### Verification performed and limits

- **Artifact checks:** targeted Prettier checks passed for the review document, reproduction scripts, README and STATUS. A coverage/whitespace assertion verified exactly 76 unique ordered PR rows and no trailing whitespace; `git diff --check` passed.
- **Inventory and coverage:** successful GitHub read-only inventory and local Git-object checks covered all 76 PRs. Coverage assembly asserted exactly one ledger row for every number 1–76. No remote ref update, merge, approval, deployment or database mutation occurred.
- **New reproductions:** Node 22 executed both retained reproduction scripts above successfully. Their success confirms the reviewed failures against mocked boundaries; these are not post-fix regression passes or hosted measurements.
- **Lead focused unit checks:** `node node_modules/vitest/vitest.mjs run src/shared/reader/public-search/public-search.test.ts src/frontend/features/articles/draft-save-state/draft-save-state.test.ts src/backend/media/retired-media-cleanup/retired-media-cleanup.test.ts --maxWorkers=1 --no-file-parallelism` passed 3 files / 13 tests. Separately, `node node_modules/vitest/vitest.mjs run scripts/import-boundaries/import-boundaries.test.mjs --maxWorkers=1 --no-file-parallelism` passed 1 file / 13 tests. Both used Node 22.20.0 via the installed version-manager PATH.
- **Reviewer-focused unit evidence:** the #51–#76 reviewer ran the current-checkout public-media/homepage/site/article/body/reader selection: 19 files / 88 tests passed. The #27–#50 reviewer ran CI-port, lifecycle and import-boundary suites: 27/28 passed initially, then all 13 import-boundary cases passed with a 20-second timeout. These counts overlap other runs and must not be added as distinct tests. None of these commands checked out or tested every open PR head.
- **Full-suite limitation:** default and two-worker full Vitest attempts exceeded the import-boundary test's five-second deadline and then stopped producing progress; the lead interrupted both (exit 130). The focused import-boundary rerun passed without changing code or the default test timeout. There is no clean full-suite result from this review, and the cause of the stalled runs was not established.
- **Existing reducer evidence:** an independent mocked current-reducer sequence confirmed existing finding 6: unavailable save, conflicting retry and explicit reload leave `phase:uncertain,pending:true,reloadRejected:true`. It does not prove the complete database/browser scenario.
- **Not run:** SQL/pgTAP, independent-session database concurrency, full browser suite, production build, dependency audit, hosted OAuth/headers, real Storage cleanup, or performance benchmarks. No production speedup or fresh integrated security certification is claimed. All proposed changes still need their task-specific acceptance checks, role/ownership denials and affected documentation updates.

### Recommended task order

1. Resolve mixed-provider last-administrator counting (24) before #75; repair cleanup fairness (28) before relying on #74 for finding 1.
2. Complete editor/media recovery findings 5–7, 25 and 26 together in small reviewed slices, preserving exact retry and ownership checks.
3. Fix contributor no-op recovery (29), then validate the other currently present low findings and pending public-reader corrections.
4. Take O1 as the smallest deterministic request-reduction task. Profile O2/O3, verify O4 with query plans, and consolidate O5 under one explicit build environment.
5. Complete the documented browser, hosted and operational launch gates. Finding 2 remains lower-priority defensive consistency work for inconsistent stored state.

Implementation order is proposed in the [easy-first fix plan](../superpowers/plans/2026-11-10-review-fixes-easy-first.md). Planned tasks are not completed fixes.

## Easy-first implementation follow-up

The six ordered tasks in the [easy-first plan](../superpowers/plans/2026-11-10-review-fixes-easy-first.md) are implemented and locally verified on branch `fix/review-easy-wins`, based on merged main `895bd98`. Findings **12, 14, 17, 27 and 29**, plus optimization **O1**, are resolved in that working tree; the historical tables above remain review snapshots. No merge or deployment is claimed.

Verification after all implementations: 885 unit/component tests, 217 read-only TS/SQL parity cases and 30 desktop/mobile browser cases passed. TypeScript, lint, formatting and the browser suite's production build passed. The plan records exact commands, independent review and initial failures/corrections. The query optimization proves removal of four duplicate catalog requests in the normal case, without shared caching; latency was not benchmarked.

Final type checking also uncovered a pre-existing merged #71 typo calling undefined `letters(section)` in public archive resolution. It now uses the existing `isLettersSection(section)` predicate; existing archive and full unit checks pass. Other findings, especially administrator eligibility (24), cleanup fairness (28) and the known no-JavaScript matched-resource 404 release blocker, remain outside this six-task slice.

## Easiest medium implementation follow-up

Findings **7, 26 and 25** are implemented and locally verified in `fix/review-medium-easy`, based on corrected PR #77 head `1dfa5bd`. Image writes preserve newer form content; explicit retries retain the complete original command and newer metadata; finalization uses the common article-before-asset lock order. Later access/missing-resource denials preserve an uncertain image command until its receipt can be recovered.

The [medium fix plan](../superpowers/plans/2026-11-11-medium-easy-fixes.md) records scope, independent review, 46 distinct unit/component cases, 68 SQL assertions, 14 independent-session races, strict types, lint and formatting. Full suites/build/browser/clean-install and hosted checks remain CI work. These changes are uncommitted; no merge or deployment is claimed. Historical tables above retain their original review status. Findings 5/6/24/28 remain outside this batch.

## Recovery and cleanup follow-up

Findings 28, 5 and 6 are implemented on `fix/review-recovery-cleanup`, based on main `fc43967`. The [focused plan](../superpowers/plans/2026-11-11-recovery-cleanup-fixes.md) records fairness, explicit cancellation, receipt-safe recovery and targeted verification. This is implementation evidence, not a merged or deployed status. Original findings remain historical; missing-resource/access responses intentionally retain uncertain retry handles because they can precede receipt lookup. No automatic upload expiration was added.
