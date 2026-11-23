import { z } from "@/shared/validation/zod/zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

export const tagNameSchema = z
  .string()
  .transform((name) => name.replace(/\s+/gu, " ").trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(120)
      .refine((name) => !/\p{Cc}/u.test(name)),
  );
export const ensureTagResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    id: z.custom<string>(isDraftUuid),
    name: z.string().min(1).max(120),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u),
    created: z.boolean(),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum([
      "forbidden",
      "invalid_input",
      "conflict",
      "rate_limited",
      "unavailable",
    ]),
  }),
]);
export type EnsureTagResult = z.infer<typeof ensureTagResultSchema>;
