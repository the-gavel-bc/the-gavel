import "server-only";

import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";

const slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u);
// Match PostgreSQL character limits for text with supplementary characters.
const boundedText = (max: number) =>
  z.string().refine((value) => {
    const length = Array.from(value).length;
    return length > 0 && length <= max;
  });
const plainText = boundedText(5000)
  .refine(
    (value) =>
      !/[<>]/u.test(value) && !/[\p{Cc}]/u.test(value.replace(/[\n\t]/gu, "")),
  )
  .nullable();
const email = z
  .string()
  .max(254)
  .refine(
    (value) =>
      !/[\p{Cc}]/u.test(value) &&
      /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(
        value,
      ) &&
      value.split("@")[0].length <= 64 &&
      !/(^\.|\.\.|\.$)/u.test(value.split("@")[0]) &&
      value
        .split("@")[1]
        .split(".")
        .every((label) =>
          /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label),
        ),
  )
  .nullable();
const instagram = z
  .string()
  .max(255)
  .refine(
    (value) =>
      !/[\p{Cc}]/u.test(value) &&
      /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._/]+$/u.test(value),
  )
  .nullable();
const category = z.strictObject({ name: boundedText(120), slug });
const section = z.strictObject({
  name: boundedText(120),
  slug,
  categories: z.array(category).max(1000),
});
const responseSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({
    kind: z.literal("ok"),
    sections: z.array(section).max(100),
    information: z.strictObject({
      mission: plainText,
      contactEmail: email,
      instagramUrl: instagram,
      submissionInstructions: plainText,
    }),
  }),
]);
export type PublicSiteNavigation = z.infer<typeof responseSchema>;

export async function getPublicSiteNavigation(): Promise<PublicSiteNavigation> {
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "get_public_site_navigation",
    );
    if (error) return { kind: "unavailable" };
    const result = responseSchema.safeParse(data);
    if (!result.success) return { kind: "unavailable" };
    if (result.data.kind === "unavailable") return result.data;
    const sections = result.data.sections;
    if (
      sections.reduce((sum, item) => sum + item.categories.length, 0) > 1000 ||
      new Set(sections.map((item) => item.slug)).size !== sections.length ||
      sections.some(
        (item) =>
          new Set(item.categories.map((category) => category.slug)).size !==
          item.categories.length,
      )
    )
      return { kind: "unavailable" };
    return result.data;
  } catch {
    return { kind: "unavailable" };
  }
}
