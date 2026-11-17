import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

const uuid = z.custom<string>(isDraftUuid);
const role = z.enum(["author", "administrator"]);
const displayName = z
  .string()
  .min(1)
  .max(120)
  .refine((value) => value === value.trim() && !/[\p{Cc}]/u.test(value));
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
  return command.kind === "invite"
    ? { ok: false, code: "unavailable" }
    : { ok: true, changed: true };
}

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
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Several addresses on one line, or "email, Name" on its own line.
    const parts = trimmed.split(",").map((part) => part.trim());
    const addresses = parts.filter((part) => part.includes("@"));
    const names = parts.filter((part) => part && !part.includes("@"));
    const lineEntries =
      addresses.length === 1 && names.length === 1
        ? [{ address: addresses[0], name: names[0] }]
        : addresses.map((address) => ({ address, name: null }));
    if (!lineEntries.length) invalid.push(trimmed);
    for (const { address, name } of lineEntries) {
      const parsed = email.safeParse(address);
      if (!parsed.success) {
        invalid.push(address);
        continue;
      }
      if (seen.has(parsed.data)) continue;
      seen.add(parsed.data);
      const checked = name ? displayName.safeParse(name) : null;
      entries.push({
        email: parsed.data,
        displayName: checked?.success ? checked.data : null,
      });
    }
  }
  return { entries, invalid };
}
