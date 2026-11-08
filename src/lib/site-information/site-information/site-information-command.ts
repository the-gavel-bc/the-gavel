import { z } from "zod";
import { isDraftUuid } from "@/lib/articles/draft-cursor/draft-cursor";

const uuid = z.custom<string>(isDraftUuid);
const version = z.number().int().min(1).max(2147483647);
const text = z
  .string()
  .max(5000)
  .nullable()
  .refine(
    (value) =>
      value === null ||
      (value.length > 0 &&
        !/[<>]/u.test(value) &&
        !/[\p{Cc}]/u.test(value.replace(/[\n\t]/gu, ""))),
  );
const email = z
  .string()
  .max(254)
  .regex(
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u,
  )
  .nullable();
const instagram = z
  .string()
  .max(255)
  .regex(/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._/]+$/u)
  .nullable();
export const siteInformationCommandSchema = z.strictObject({
  requestId: uuid,
  expectedVersion: version,
  mission: text,
  contactEmail: email,
  instagramUrl: instagram,
  submissionInstructions: text,
});
export type SiteInformationCommand = z.infer<
  typeof siteInformationCommandSchema
>;
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
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
export type SiteInformationResult = z.infer<typeof resultSchema>;
export function parseSiteInformationResult(
  input: unknown,
): SiteInformationResult {
  const result = resultSchema.safeParse(input);
  return result.success ? result.data : { ok: false, code: "unavailable" };
}
