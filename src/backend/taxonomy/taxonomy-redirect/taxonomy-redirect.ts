import "server-only";

import { cache } from "react";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";

const taxonomyPath =
  /^\/(?:tags\/[a-z0-9]+(?:-[a-z0-9]+)*|sections\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/categories\/[a-z0-9]+(?:-[a-z0-9]+)*)?)$/u;

export const resolveTaxonomyRedirect = cache(async (path: string) => {
  if (path.length > 266 || !taxonomyPath.test(path)) return null;
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "resolve_taxonomy_redirect",
      { p_source_path: path },
    );
    if (error || typeof data !== "string" || data === path) return null;
    if (data === "/" || data === "/letters" || data === "/search") return data;
    return data.length <= 266 && taxonomyPath.test(data) ? data : null;
  } catch {
    return null;
  }
});
