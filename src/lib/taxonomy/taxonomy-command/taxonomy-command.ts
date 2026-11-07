import { z } from "zod";
import { isDraftUuid } from "@/lib/articles/draft-cursor/draft-cursor";

const uuid = z.custom<string>(isDraftUuid);
export const taxonomyCommandSchema = z.strictObject({
  kind: z.enum(["section", "category"]),
  id: uuid,
  expectedVersion: z.number().int().min(1).max(2147483647),
  requestId: uuid,
  name: z
    .string()
    .min(1)
    .max(120)
    .refine((v) => v === v.trim() && !/[\p{Cc}]/u.test(v)),
  navigationOrder: z.number().int().min(0).max(2147483647),
  active: z.boolean(),
});
export type TaxonomyCommand = z.infer<typeof taxonomyCommandSchema>;
const code = z.enum([
  "invalid_input",
  "forbidden",
  "not_found",
  "conflict",
  "request_conflict",
  "unavailable",
]);
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    kind: z.enum(["section", "category"]),
    id: uuid,
    version: z.number().int().positive(),
    active: z.boolean(),
    changed: z.boolean(),
    replayed: z.boolean(),
  }),
  z.strictObject({ ok: z.literal(false), code }),
]);
export type TaxonomyResult = z.infer<typeof resultSchema>;
export function parseTaxonomyCommand(
  input: unknown,
): { ok: true; value: TaxonomyCommand } | { ok: false; code: "invalid_input" } {
  const parsed = taxonomyCommandSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code: "invalid_input" };
}
export function parseTaxonomyResult(
  input: unknown,
  command: TaxonomyCommand,
): TaxonomyResult {
  const parsed = resultSchema.safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.ok &&
      (parsed.data.id !== command.id ||
        parsed.data.kind !== command.kind ||
        parsed.data.active !== command.active))
  )
    return { ok: false, code: "unavailable" };
  return parsed.data;
}
