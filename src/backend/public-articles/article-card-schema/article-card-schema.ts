import "server-only";
import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { isDatabaseTimestamp } from "@/shared/articles/draft-cursor/draft-cursor";
export const publicSlugSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const slug = publicSlugSchema;
const categorySlug = slug.max(120);
const uuid = z.string().refine(isDraftUuid);
export const publicTimestampSchema = z
  .string()
  .refine(
    (s) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(s) &&
      isDatabaseTimestamp(s),
  );
const timestamp = publicTimestampSchema;
// Match PostgreSQL's Unicode code-point length semantics.
const text = (max: number, min = 0) =>
  z.string().refine((s) => {
    const length = Array.from(s).length;
    return length >= min && length <= max;
  });
const publicPerson = z.strictObject({
  displayName: text(120, 1),
  slug: slug.nullable(),
});
export const publicArticleCardSchema = z.strictObject({
  id: uuid,
  slug,
  title: text(240, 1),
  excerpt: text(600).nullable(),
  publishedAt: timestamp,
  section: z.strictObject({ name: text(120, 1), slug: categorySlug }),
  owner: publicPerson,
  // Credit-only people have no author page, so no slug.
  writers: z
    .array(z.strictObject({ displayName: text(120, 1), slug: slug.nullable() }))
    .max(32),
  mainImage: z
    .strictObject({
      id: uuid,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      alt: text(240, 1),
      credit: text(240, 1),
    })
    .nullable(),
});
