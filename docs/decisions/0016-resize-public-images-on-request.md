# 0016: Resize public images on request

- Status: Accepted
- Date: 2026-11-26
- Related requirements: [performance plan, slice 3](../superpowers/plans/2026-11-26-performance-batch.md#slice-3-images-sized-for-the-screen-9), [public media delivery](../security-and-permissions.md#public-media-delivery-route)
- Supersedes / superseded by: supersedes the C-22 suggestion in [DEFERRED.md](../code-reviews/DEFERRED.md) to store variants at upload

## Context

Public article photos were served as single WebP files up to 2400 px wide, so phones downloaded full-size files for 128–330 px thumbnails. `next/image` cannot be used: its inline styles break the nonce CSP, and its optimizer cache could keep serving derivatives after an article is archived. The public media route already authorizes every request against current publication, and checks the stored original's size, SHA-256 and WebP envelope before returning bytes.

## Decision

The public media route accepts an optional `w` of 480, 960 or 1600. It runs the existing projection, Storage download and integrity checks on the original first, then resizes it with sharp to WebP at quality 80, without enlarging. Any other `w` value returns the generic 404 with no-store. Responses keep the approved five-minute public cache, so the takedown bound is unchanged. Reader components emit a `srcset` of the smaller widths plus the original, with a measured `sizes` value for each placement. Private previews and the dashboard keep full-size images.

## Alternatives considered

- **Store variants at upload.** This adds Storage objects, finalization steps, hashes and cleanup paths. It also widens the Storage authorization policy, which only allows known finalized keys. It is more code on the most security-sensitive path.
- **`next/image` or Vercel image optimization.** Blocked by the nonce CSP (inline styles). Its derivative cache would also outlive an archive.
- **Arbitrary widths.** Each value would create a separate CDN entry and allow cache-busting; three fixed widths bound both.

## Consequences

- Phones download a fraction of the bytes. Measured locally on 8 homepage images: 1,351 KB of originals, 584 KB at 960 px and 226 KB at 480 px.
- A CDN miss on a variant costs one decode and encode, roughly 20 MB of memory for a 2400 px image. Each width is cached for five minutes per region, which bounds that cost at the site's traffic.
- The `sizes` values come from measured layout widths. A layout change should update them in `src/shared/reader/public-image/public-image.ts`.

## Validation

- Unit tests cover width parsing and the `srcset` builder. Route tests cover the resize, an original that is not wider, unlisted widths rejected before any read, and a denied original also denying its variant.
- Playwright: an unattached upload's variant is 404. An attached one returns 480 px with the five-minute cache, and a 2x phone viewport loads the 960 px variant.
