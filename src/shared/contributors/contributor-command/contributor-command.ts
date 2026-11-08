import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

const uuid = z.custom<string>(isDraftUuid);
const version = z.number().int().positive().max(2147483647);
const name = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim() && !/[\p{Cc}]/u.test(value));
const biography = z
  .string()
  .max(5000)
  .nullable()
  .refine(
    (value) =>
      value === null || !/[\p{Cc}]/u.test(value.replace(/[\n\t]/gu, "")),
  );
export const contributorCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("create"),
    requestId: uuid,
    displayName: name,
    biography,
  }),
  z.strictObject({
    kind: z.literal("save"),
    profileId: uuid,
    expectedVersion: version,
    requestId: uuid,
    displayName: name,
    biography,
  }),
  z.strictObject({
    kind: z.literal("deactivate"),
    profileId: uuid,
    expectedVersion: version,
    requestId: uuid,
  }),
]);
export type ContributorCommand = z.infer<typeof contributorCommandSchema>;
const code = z.enum([
  "invalid_input",
  "forbidden",
  "not_found",
  "conflict",
  "request_conflict",
  "unavailable",
]);
export type ContributorResult =
  | {
      ok: true;
      profileId: string;
      slug: string;
      version: number;
      active: boolean;
      changed: boolean;
      replayed: boolean;
    }
  | { ok: false; code: z.infer<typeof code> };
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    profileId: uuid,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(180),
    version,
    active: z.boolean(),
    changed: z.boolean(),
    replayed: z.boolean(),
  }),
  z.strictObject({ ok: z.literal(false), code }),
]);
export function parseContributorCommand(
  input: unknown,
):
  | { ok: true; value: ContributorCommand }
  | { ok: false; code: "invalid_input" } {
  const parsed = contributorCommandSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code: "invalid_input" };
}
export function parseContributorResult(
  input: unknown,
  command: ContributorCommand,
): ContributorResult {
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unavailable" };
  if (
    parsed.data.ok &&
    ((command.kind !== "create" &&
      parsed.data.profileId !== command.profileId) ||
      parsed.data.active !== (command.kind !== "deactivate"))
  )
    return { ok: false, code: "unavailable" };
  return parsed.data;
}
