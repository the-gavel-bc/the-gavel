import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

const uuid = z.custom<string>(isDraftUuid);
const plain = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => v === v.trim() && !/[\p{Cc}]/u.test(v));

export const taxonomyCurationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("createSection"),
    requestId: uuid,
    name: plain(120),
    navigationOrder: z.number().int().min(0).max(2147483647),
  }),
  z.strictObject({
    kind: z.literal("createCategory"),
    requestId: uuid,
    name: plain(120),
    navigationOrder: z.number().int().min(0).max(2147483647),
    sectionId: uuid,
  }),
  z.strictObject({
    kind: z.literal("renameTag"),
    requestId: uuid,
    id: uuid,
    // Tag names have single spaces only, like names made in the editor.
    name: plain(120).refine((v) => !/\s{2,}/u.test(v) && !/[^\S ]/u.test(v)),
  }),
  z.strictObject({
    kind: z.literal("mergeTags"),
    requestId: uuid,
    id: uuid,
    targetId: uuid,
  }),
  z.strictObject({
    kind: z.literal("deleteTaxonomy"),
    requestId: uuid,
    itemKind: z.enum(["section", "category"]),
    id: uuid,
  }),
  z.strictObject({
    kind: z.literal("deleteTag"),
    requestId: uuid,
    id: uuid,
  }),
]);
export type TaxonomyCuration = z.infer<typeof taxonomyCurationSchema>;

const code = z.enum([
  "invalid_input",
  "forbidden",
  "not_found",
  "conflict",
  "request_conflict",
  "unavailable",
]);
export type CurationResult =
  { ok: true; id?: string } | { ok: false; code: z.infer<typeof code> };
const resultSchema = z.union([
  z.looseObject({
    ok: z.literal(true),
    replayed: z.boolean(),
    id: uuid.optional(),
  }),
  z.strictObject({ ok: z.literal(false), code }),
]);

export function parseTaxonomyCuration(
  input: unknown,
):
  { ok: true; value: TaxonomyCuration } | { ok: false; code: "invalid_input" } {
  const parsed = taxonomyCurationSchema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code: "invalid_input" };
}

export function parseCurationResult(input: unknown): CurationResult {
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unavailable" };
  return parsed.data.ok ? { ok: true, id: parsed.data.id } : parsed.data;
}
