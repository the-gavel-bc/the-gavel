import { z } from "zod";

// Both clients and callback URL construction require a service origin, not
// arbitrary URL schemes, credentials, paths, query strings, or fragments.
export const httpOriginSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
  );
});
export const publishableKeySchema = z.string().trim().min(1);
