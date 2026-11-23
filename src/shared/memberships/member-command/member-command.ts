import { hasUnsupportedDisplayCharacter } from "@/shared/validation/display-text/display-text";
import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
import { staffRoleSchema } from "@/shared/memberships/staff-roles/staff-roles";

const uuid = z.custom<string>(isDraftUuid);
const version = z.number().int().positive().max(2147483647);
const role = staffRoleSchema;
const displayName = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim() && !/[\p{Cc}\p{Cf}]/u.test(value));

export const newStaffDisplayNameSchema = displayName.refine(
  (name) => !hasUnsupportedDisplayCharacter(name),
);

export const memberCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("approve"),
    targetUserId: uuid,
    requestId: uuid,
    role,
    displayName,
    expectedVersion: version,
  }),
  z.strictObject({
    kind: z.literal("changeRole"),
    targetUserId: uuid,
    requestId: uuid,
    role,
    expectedVersion: version,
  }),
  z.strictObject({
    kind: z.literal("deactivate"),
    targetUserId: uuid,
    requestId: uuid,
    expectedVersion: version,
  }),
]);
export type MemberCommand = z.infer<typeof memberCommandSchema>;
const failureCode = z.enum([
  "invalid_input",
  "forbidden",
  "not_found",
  "conflict",
  "last_administrator",
  "request_conflict",
  "unavailable",
]);
export type MemberResult =
  | {
      ok: true;
      targetUserId: string;
      role: z.infer<typeof role>;
      active: boolean;
      version: number;
      changed: boolean;
      replayed: boolean;
    }
  | { ok: false; code: z.infer<typeof failureCode> };

const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    targetUserId: uuid,
    role,
    active: z.boolean(),
    version,
    changed: z.boolean(),
    replayed: z.boolean(),
  }),
  z.strictObject({ ok: z.literal(false), code: failureCode }),
]);

export function parseMemberCommand(
  input: unknown,
): { ok: true; value: MemberCommand } | { ok: false; code: "invalid_input" } {
  const parsed = memberCommandSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code: "invalid_input" };
}

export function parseMemberResult(
  input: unknown,
  command: MemberCommand,
): MemberResult {
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unavailable" };
  if (parsed.data.ok) {
    if (
      parsed.data.targetUserId !== command.targetUserId ||
      parsed.data.active !== (command.kind !== "deactivate") ||
      (command.kind !== "deactivate" && parsed.data.role !== command.role)
    )
      return { ok: false, code: "unavailable" };
  }
  return parsed.data;
}
