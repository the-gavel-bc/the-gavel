# Public catalog visibility follow-up

Scope: C-10 and C-11 from the [combined review](COMBINED-REVIEW-REPORT.md). Search admission is handled separately in PR #131.

## Behavior implemented

- Anonymous readers and signed-in visitors without eligible active membership can see a tag only when an article in its archive is published and has an active section and owner. Eligible active members retain access to the complete editor tag catalog. A tag with no public article returns 404 through the existing anonymous lookup for `/tags/[slug]`. The tag becomes public again when it gains an eligible publication.
- Signed-in visitors without eligible active membership get the existing anonymous profile row scope. Only active, account-linked profiles are visible to them. Eligible active members keep the active profile catalog used by the editor. Administrators retain access to inactive profiles. Existing public author pages for active, account-linked profiles continue to work.
- Anonymous profile grants retain the columns the author page reads. Remove anonymous grants for the profile ID and internal timestamps. Public card and image RPCs keep their existing response shapes.

## Acceptance

1. Confirm a draft-only tag and a credit-only biography are hidden from anonymous, pending and inactive sessions. Confirm the editor catalog still works for an eligible member.
2. Confirm a published tag remains visible and archive pagination still works. Check that archiving its last eligible article removes the archive without a mixed snapshot or a permanently cached 404.
3. Verify anonymous column grants, existing public author metadata and privileged read paths. Use the existing tag association index. Keep RPC contracts and stored data intact.


## Rollout and rollback

Apply the policy migration before deploying the archive reader. The migration changes grants and read policies without rewriting existing data or changing RPC signatures. A follow-up migration can restore the previous policies and column grants if needed.
