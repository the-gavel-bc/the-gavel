import { hasUnsupportedDisplayCharacter } from "@/shared/validation/display-text/display-text";
import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

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
// Same rule as SQL private.is_valid_contact_email and the public reader, so an
// address that saves is never silently hidden on public pages.
export function isValidContactEmail(value: string): boolean {
  if (
    value.length > 254 ||
    /[\p{Cc}]/u.test(value) ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(
      value,
    )
  )
    return false;
  const [local, domain] = value.split("@");
  return (
    local.length <= 64 &&
    !/(^\.|\.\.|\.$)/u.test(local) &&
    domain
      .split(".")
      .every((label) =>
        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label),
      )
  );
}
const email = z.string().refine(isValidContactEmail).nullable();
const instagram = z
  .string()
  .max(255)
  .regex(/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._/]+$/u)
  .nullable();
// Official HTTPS hosts only; mirrors SQL private.is_valid_social_url.
export const socialUrlPattern = {
  spotify: /^https:\/\/open\.spotify\.com\/[A-Za-z0-9._/-]+$/u,
  linkedin:
    /^https:\/\/(?:www\.)?linkedin\.com\/(?:company|school|showcase|in)\/[A-Za-z0-9._%-]+\/?$/u,
  facebook: /^https:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9._/-]+$/u,
} as const;
const social = (kind: keyof typeof socialUrlPattern) =>
  z.string().max(255).regex(socialUrlPattern[kind]).nullable();
export const siteInformationTransportSchema = z.strictObject({
  requestId: uuid,
  expectedVersion: version,
  mission: text,
  contactEmail: email,
  instagramUrl: instagram,
  spotifyUrl: social("spotify"),
  linkedinUrl: social("linkedin"),
  facebookUrl: social("facebook"),
  submissionInstructions: text,
});
export const siteInformationCommandSchema =
  siteInformationTransportSchema.superRefine((value, context) => {
    for (const field of ["mission", "submissionInstructions"] as const) {
      if (hasUnsupportedDisplayCharacter(value[field])) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Remove invisible format characters.",
        });
      }
    }
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
