import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
const uuid = z.custom<string>(isDraftUuid);
const version = z.number().int().min(1).max(2147483647);
export const ownProfileCommandSchema = z.strictObject({
  requestId: uuid,
  expectedVersion: version,
  displayName: z
    .string()
    .min(1)
    .max(120)
    .refine((v) => v === v.trim() && !/[\p{Cc}]/u.test(v)),
  biography: z
    .string()
    .max(5000)
    .nullable()
    .refine((v) => v === null || !/[\p{Cc}]/u.test(v.replace(/[\n\t]/gu, ""))),
});
export type OwnProfileCommand = z.infer<typeof ownProfileCommandSchema>;
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    profileId: uuid,
    slug: z.string().min(1),
    version,
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
export type OwnProfileResult = z.infer<typeof resultSchema>;
export function parseOwnProfileResult(
  input: unknown,
  profileId: string,
): OwnProfileResult {
  const parsed = resultSchema.safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.ok && parsed.data.profileId !== profileId)
  )
    return { ok: false, code: "unavailable" };
  return parsed.data;
}
