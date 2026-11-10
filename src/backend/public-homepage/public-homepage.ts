import "server-only";
import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { publicArticleCardSchema as card } from "@/backend/public-articles/article-card-schema/article-card-schema";
import type { PublicHomepageResult } from "@/shared/reader/homepage/homepage";

const schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({
    kind: z.literal("ok"),
    lead: card.nullable(),
    featured: z.array(card).max(4),
    readThis: z.array(card).max(4),
    latest: z.array(card).max(3),
    sections: z
      .array(
        z.strictObject({
          name: z
            .string()
            .refine(
              (s) => Array.from(s).length >= 1 && Array.from(s).length <= 120,
            ),
          slug: z
            .string()
            .min(1)
            .max(120)
            .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u),
          articles: z.array(card).max(4),
        }),
      )
      .max(100),
  }),
]);
export async function getPublicHomepage(): Promise<PublicHomepageResult> {
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "get_public_homepage",
    );
    if (error) return { kind: "unavailable" };
    const parsed = schema.safeParse(data);
    if (!parsed.success) return { kind: "unavailable" };
    if (parsed.data.kind === "unavailable") return parsed.data;
    const result = parsed.data;
    const curated = [
      ...(result.lead ? [result.lead] : []),
      ...result.featured,
      ...result.readThis,
    ];
    const unique = (items: { id: string }[]) =>
      new Set(items.map((item) => item.id)).size === items.length;
    if (
      !unique(curated) ||
      !unique(result.latest) ||
      result.latest.some((item) => item.id === result.lead?.id) ||
      new Set(result.sections.map((section) => section.slug)).size !==
        result.sections.length ||
      result.sections.some(
        (section) =>
          !unique(section.articles) ||
          section.articles.some((item) => item.section.slug !== section.slug),
      )
    )
      return { kind: "unavailable" };
    return result;
  } catch {
    return { kind: "unavailable" };
  }
}
