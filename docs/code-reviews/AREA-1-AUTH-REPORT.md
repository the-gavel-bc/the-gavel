# Area 1 review: authentication and access

Quick run (security, business logic, testing; Sonnet, read-only) on commit `b4afd49`. No Critical or High findings: authorization is enforced in the database (RLS, revoked direct writes, `security definer` functions guarded by the actor lock and administrator check) and rechecked in the server layer. Raw reports were saved under `docs/code-reviews/raw/area1-*.md` in the reviewer's checkout (not committed).

## Findings and outcome

| Finding | Severity | Outcome |
| --- | --- | --- |
| SEC-001 editors keep read access to any ever-submitted article, including archived | Low | Fixed. `article_authority` read mode: editors read drafts in review and articles they published. pgTAP `067`. |
| SEC-003 callback has no error handling around the access check | Low | Fixed with try/catch to the generic sign-in error. Tests added. |
| LOGIC-001 concurrent first requests can bounce a newly listed person to pending | Low | Fixed: read the membership again when the claim reports false. Tests added. |
| LOGIC-002 session expiry mid-edit reads as lost access | Low | Mitigated: the save failure now says to sign in again in another tab and retry. A full fix (distinct signed-out result, preserved `next`) is not done. |
| LOGIC-003 submit rule differs across SQL, TypeScript, matrix | Low | Matrix row corrected (editors and administrators publish directly, so submit is not offered); SQL stays permissive for owners. |
| LOGIC-004 deactivated members told to ask to be added | Low | Wording made cause-neutral ("add or reactivate"). The invite form's skipped-entry hint is not done. |
| SEC-002 `hd` claim never verified | Low | Open: needs a staging check of Google identity data; documented. |
| SEC-004 `/api/session/desk` amplification | Info | Open: platform rate limit recommended. |
| LOGIC-005 nav may not update after a mid-session role change | Low | Open: needs a runtime check; every page and action rechecks, so no access gain. |
| TEST-001/002 editor never tested on admin pages; no tests for invitation and lifecycle action guards | High (test gap) | Partly done: guard tests for invitation and lifecycle actions (author, editor, pending, signed out), editor added to the access role table. Admin page unit tests for homepage, media cleanup, site, taxonomy, members audit are still missing. |
| TEST-003/004/006/007/008/009/010 | Medium and Low | Not done: claim_invitation branch pgTAP, mid-session revocation e2e, getCurrentAccess eligibility parity table, CSP header e2e assertions, dashboard layout nav test, sign-in and access-pending tests. Callback and desk route gaps are closed. |

## Not examined

Cron auth, storage policies, public media routes, rich-text rendering, rate-limit internals, dependency audit (other areas).
