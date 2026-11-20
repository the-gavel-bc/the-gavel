# Runtime verification of review findings

Date: 2026-11-20. Method: the production build served locally (port 3171) against the disposable local Supabase, driven with headless Chromium (Playwright) and direct HTTP and REST calls. Sessions were minted for local test users (never printed). Test rows were created and removed. This closes part of the "needs a runtime check" gap named in [COMBINED-REVIEW-REPORT.md](COMBINED-REVIEW-REPORT.md) and [AREAS-6-9-12-REPORT.md](AREAS-6-9-12-REPORT.md). Not covered by this session: screen readers, real touch devices, keyboard and drag-and-drop flows, query plans and load.

## Confirmed (the finding is real)

| Finding | What was done | Result |
| --- | --- | --- |
| C-10 anonymous tag read | Created a tag used by no article; read the REST `tags` table with the anon key; opened `/tags/<slug>` | The anon key returns the tag; the public page answers 200 for a tag no published article uses. |
| C-11 profile exposure | Signed in as a Google account that is not a member; read `profiles` over REST; also read it anonymously | The non-member read a credit-only profile's name, slug and **biography**. Anonymous callers did not see that row, but can list account-holder ids and created dates through the anon column grant. |
| C-12 shared search budget | Sent 130 typeahead calls, then 160 in parallel | After 120 calls the typeahead returns 429 and `/search` renders "Search is busy" for everyone: one script starves search. |
| C-14 and C-24 caching | Read response headers | Public media `max-age=300, s-maxage=300` (takedowns lag up to 5 minutes); `sitemap.xml` is `no-store`. |
| C-05 byline in UTC | Set an article's publish time to 02:30 UTC on Nov 18 (9:30 pm Eastern, Nov 17) and read the public page | The byline shows **November 18**. |
| D-01 audit page | Opened Article activity as an administrator with submit and return events in the log | The page shows "Unable to load article activity." |
| D-17 page titles | Read the title of four dashboard pages | Every one is "Dashboard \| The Gavel". |
| C-33 phone save bar | Opened an in-review draft as an administrator at 375 px and 320 px | The save bar is 491 px wide and the document scrolls horizontally (scroll width 491 px): the Save button sits off the right edge of the screen. Measured with four buttons (Cancel, Return, Publish, Save); fewer buttons were not measured. **New urgent item.** |
| 6/logic-5 homepage fragility | In a rolled-back transaction, made the newest published article's main image pending and called the public homepage function as the anon role | `get_public_homepage` returns "unavailable": one bad card takes the whole homepage down (reachable only through a data fault). |

## Refuted (the finding was wrong)

| Finding | Result |
| --- | --- |
| 12/ux-1 mobile menu stays open after following a link | At 375 px the menu was open before the tap and closed after navigating to About. Not a bug. |

## Not proven or not tested

| Finding | Why |
| --- | --- |
| D-03 tag merge fails past 50 tags | With 61 tags the admin Tags page showed no tag rows to count or edit in this session; the claim rests on reading the code. Needs a manual look at the Tags view. |
| An automated Save tap blocked on an iPhone viewport | Not reproduced; a direct hit test shows the button on top. Likely an automation artifact; see DEFERRED.md. |
| Lifecycle controls staying locked after a status-keeping action | Not exercised. |
| All keyboard, drag-and-drop, focus and screen reader findings | Static only. |
