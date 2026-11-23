import "server-only";

import { unstable_cache, updateTag } from "next/cache";

export const PUBLIC_SHELL_TAG = "public-reader-shell";
const maxAgeSeconds = 60;
const unavailable = { kind: "unavailable" } as const;
class PublicReadUnavailable extends Error {}

export function cachePublicShellRead<T extends { kind: "ok" | "unavailable" }>(
  key: "navigation" | "footer",
  read: () => Promise<T>,
): () => Promise<T | typeof unavailable> {
  const cachedRead = unstable_cache(
    async () => {
      const at = Date.now();
      const data = await read();
      // Next caches fulfilled values. An outage should not replace fresh data.
      if (data.kind === "unavailable") throw new PublicReadUnavailable();
      return { at, data };
    },
    ["public-shell", key],
    { tags: [PUBLIC_SHELL_TAG], revalidate: maxAgeSeconds },
  );
  return async () => {
    try {
      const entry = await cachedRead();
      // Next may serve stale data while it refreshes. Enforce the reader's bound.
      if (Date.now() - entry.at < maxAgeSeconds * 1000) return entry.data;
    } catch (error) {
      if (error instanceof PublicReadUnavailable) return unavailable;
    }
    return read();
  };
}

export function invalidatePublicShell() {
  try {
    updateTag(PUBLIC_SHELL_TAG);
  } catch {
    // Cache failures must not mask a confirmed database receipt.
    console.error(
      "Public reader cache invalidation failed after a committed write.",
    );
  }
}
