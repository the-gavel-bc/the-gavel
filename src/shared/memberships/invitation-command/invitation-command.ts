import { hasUnsupportedDisplayCharacter } from "@/shared/validation/display-text/display-text";
import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
import { staffRoleSchema } from "@/shared/memberships/staff-roles/staff-roles";

const uuid = z.custom<string>(isDraftUuid);
const role = staffRoleSchema;
const displayName = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim() && !/[\p{Cc}\p{Cf}]/u.test(value));
const newDisplayName = displayName.refine(
  (name) => !hasUnsupportedDisplayCharacter(name),
);
const email = z
  .string()
  .max(255)
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().regex(/^[^@\s]+@bc\.edu$/u));

export const MAX_INVITES = 200;

export const invitationCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("invite"),
    requestId: uuid,
    entries: z
      .array(
        z.strictObject({
          email,
          role,
          displayName: displayName.nullable().optional(),
        }),
      )
      .min(1)
      .max(MAX_INVITES)
      .refine(
        (entries) =>
          new Set(entries.map((entry) => entry.email)).size === entries.length,
      ),
  }),
  z.strictObject({
    kind: z.literal("changeRole"),
    requestId: uuid,
    invitationId: uuid,
    expectedVersion: z.number().int().positive().max(2147483647),
    role,
  }),
  z.strictObject({
    kind: z.literal("remove"),
    requestId: uuid,
    invitationId: uuid,
    expectedVersion: z.number().int().positive().max(2147483647),
  }),
]);
export type InvitationCommand = z.infer<typeof invitationCommandSchema>;

const failureCode = z.enum([
  "invalid_input",
  "forbidden",
  "not_found",
  "conflict",
  "request_conflict",
  "unavailable",
]);
export type InvitationResult =
  | { ok: true; added: number; updated: number; skipped: string[] }
  | { ok: true; changed: true }
  | { ok: false; code: z.infer<typeof failureCode> };

const resultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    added: z.number().int(),
    updated: z.number().int(),
    skipped: z.array(z.string().max(255)).max(MAX_INVITES),
    replayed: z.boolean(),
  }),
  z.strictObject({
    ok: z.literal(true),
    invitationId: uuid,
    role,
    version: z.number().int(),
    replayed: z.boolean(),
  }),
  z.strictObject({ ok: z.literal(false), code: failureCode }),
]);

export function parseInvitationCommand(
  input: unknown,
):
  | { ok: true; value: InvitationCommand }
  | { ok: false; code: "invalid_input" } {
  const parsed = invitationCommandSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code: "invalid_input" };
}

export function parseInvitationResult(
  input: unknown,
  command: InvitationCommand,
): InvitationResult {
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unavailable" };
  const value = parsed.data;
  if (!value.ok) return value;
  if ("added" in value)
    return command.kind === "invite"
      ? {
          ok: true,
          added: value.added,
          updated: value.updated,
          skipped: value.skipped,
        }
      : { ok: false, code: "unavailable" };
  if (command.kind === "invite") return { ok: false, code: "unavailable" };
  if (
    value.invitationId !== command.invitationId ||
    value.version !== command.expectedVersion + 1 ||
    (command.kind === "changeRole" && value.role !== command.role)
  )
    return { ok: false, code: "unavailable" };
  return { ok: true, changed: true };
}

// Keep BOM characters visible to name validation while trimming pasted spacing.
const trimPastedText = (value: string) =>
  value.replace(/^[^\S\uFEFF]+|[^\S\uFEFF]+$/gu, "");

/**
 * Turns pasted text into entries: one per line (or separated by commas or
 * semicolons). A line may read `email` or `email, Display Name`.
 */
export function parseInviteText(text: string): {
  entries: { email: string; displayName: string | null }[];
  invalid: string[];
} {
  const seen = new Set<string>();
  const entries: { email: string; displayName: string | null }[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n|;/u)) {
    const trimmed = trimPastedText(line);
    if (!trimmed) continue;
    // Accept email, email plus a comma-separated name, and Name <email>.
    const parts = trimmed.split(",").map(trimPastedText);
    const explicit = parts.flatMap((part) => {
      const angle = /^(.*?)<([^<>]+)>$/u.exec(part);
      return angle
        ? [{ address: angle[2].trim(), name: trimPastedText(angle[1]) || null }]
        : part.includes("@")
          ? [{ address: part, name: null }]
          : [];
    });
    const names = parts.filter((part) => part && !part.includes("@"));
    const lineEntries =
      explicit.length === 1 && explicit[0]?.name === null && names.length === 1
        ? [{ address: explicit[0].address, name: names[0] }]
        : explicit;
    if (
      !lineEntries.length ||
      (explicit.length !== 1 && names.length > 0) ||
      (explicit.length === 1 && explicit[0]?.name && names.length > 0)
    )
      invalid.push(trimmed);
    for (const { address, name } of lineEntries) {
      const parsed = email.safeParse(address);
      if (!parsed.success) {
        invalid.push(address);
        continue;
      }
      if (seen.has(parsed.data)) continue;
      seen.add(parsed.data);
      const checked = name ? newDisplayName.safeParse(name) : null;
      if (checked && !checked.success) {
        invalid.push(trimmed);
        continue;
      }
      entries.push({
        email: parsed.data,
        displayName: checked?.data ?? null,
      });
    }
  }
  return { entries, invalid };
}
