import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
const uuid = z.custom<string>(isDraftUuid);
export const homepageCommandSchema = z
  .strictObject({
    requestId: uuid,
    expectedVersion: z.number().int().min(1).max(2147483647),
    lead: uuid.nullable(),
    featured: z.array(uuid).max(4),
    readThis: z.array(uuid).max(4),
  })
  .refine((value) => {
    const ids = [
      ...(value.lead ? [value.lead] : []),
      ...value.featured,
      ...value.readThis,
    ];
    return new Set(ids.map((id) => id.toLowerCase())).size === ids.length;
  });
export type HomepageCommand = z.infer<typeof homepageCommandSchema>;
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    version: z.number().int().positive(),
    changed: z.boolean(),
    replayed: z.boolean(),
  }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum([
      "invalid_input",
      "forbidden",
      "conflict",
      "request_conflict",
      "unavailable",
    ]),
  }),
]);
export type HomepageResult = z.infer<typeof resultSchema>;
export function parseHomepageResult(value: unknown): HomepageResult {
  const parsed = resultSchema.safeParse(value);
  return parsed.success ? parsed.data : { ok: false, code: "unavailable" };
}
