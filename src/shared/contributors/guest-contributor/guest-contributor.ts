import { z } from "@/shared/validation/zod/zod";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
const uuid = z.custom<string>(isDraftUuid);
export const contributorNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((name) => !/[\u0000-\u001f\u007f]/u.test(name));
export const contributorChoiceSchema = z.strictObject({
  id: uuid,
  displayName: z.string().min(1).max(120),
  slug: z.string().min(1).max(180),
});
export type ContributorChoice = z.infer<typeof contributorChoiceSchema>;
const failureSchema = z.strictObject({
  ok: z.literal(false),
  code: z.enum([
    "invalid_input",
    "forbidden",
    "rate_limited",
    "request_conflict",
    "unavailable",
  ]),
});
export const contributorSearchResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    items: z.array(contributorChoiceSchema).max(10),
  }),
  failureSchema,
]);
export const guestContributorResultSchema = z.union([
  contributorChoiceSchema.extend({
    ok: z.literal(true),
    created: z.boolean(),
    replayed: z.boolean(),
  }),
  failureSchema,
]);
export const guestContributorCommandSchema = z.strictObject({
  requestId: uuid,
  displayName: contributorNameSchema,
});
export type ContributorSearchResult = z.infer<
  typeof contributorSearchResultSchema
>;
export type GuestContributorResult = z.infer<
  typeof guestContributorResultSchema
>;
export type GuestContributorCommand = z.infer<
  typeof guestContributorCommandSchema
>;
