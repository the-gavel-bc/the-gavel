# Article corrections

Decisions (user, 2026-11-24): editors and administrators can add a correction; editors only on articles they published (or drafts in review); the article shows "Updated <date>"; saved by its own control. Reference UI: the demo frontend's optional "Correction" field (2,000 characters, callout after the article body).

Why its own function: published articles are administrator-only to edit, so an editor correcting their own publication cannot use the normal Save. A dedicated `set_article_correction` leaves the draft input contract, fingerprints and every save function untouched, and the per-role rule lives in one new `article_authority` mode (`correct`).

Acceptance criteria

- Authors, other editors and anonymous callers cannot set a correction (database and action); administrators can on any draft or published article; editors on drafts in review and on their own publications.
- Text is plain, 1–2,000 characters, blank clears; markup, control and invisible characters are refused.
- Two people editing the same correction conflict instead of overwriting; an exact retry replays; changed payload with the same request id conflicts.
- Public article shows the note after the body and "Updated <Eastern date>" in the byline; no note, no marker.
- Every real change writes an `article.corrected` audit event.

Not done: a revision snapshot of the note (it is not in the draft snapshot); a correction history screen; JSON-LD `dateModified` (the site has no structured data yet); showing the note on article cards or search.

Verification: pgTAP 089 (and 067, 069); Vitest for permissions, action, panel, editor page and public page; typecheck, lint, format, build.
