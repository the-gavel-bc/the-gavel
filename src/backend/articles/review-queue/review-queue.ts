import "server-only";

import { connection } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  isDatabaseTimestamp,
  isDraftUuid,
} from "../../../shared/articles/draft-cursor/draft-cursor";

export type ReviewItem = {
  id: string;
  title: string;
  status: "draft" | "published";
  ownerName: string;
  sectionName: string;
  /** When it was submitted (drafts) or published (an editor's own publications). */
  at: string;
};
const rowBase = z.object({
  article_id: z.custom<string>(isDraftUuid),
  title: z.string().max(240),
  owner_name: z.string().max(200),
  section_name: z.string().max(160),
  submitted_at: z.custom<string>(isDatabaseTimestamp).nullable(),
  published_at: z.custom<string>(isDatabaseTimestamp).nullable(),
});
const row = z.discriminatedUnion("status", [
  rowBase.extend({
    status: z.literal("draft"),
    submitted_at: z.custom<string>(isDatabaseTimestamp),
  }),
  rowBase.extend({
    status: z.literal("published"),
    published_at: z.custom<string>(isDatabaseTimestamp),
  }),
]);

// Submitted drafts waiting for an editor, then the caller's own publications
// (which only they, or an administrator, may archive). The database function
// refuses everyone but active editors and administrators.
export async function getReviewQueue(): Promise<ReviewItem[]> {
  await connection();
  const access = await requireActiveMembership();
  if (access.role === "author") redirect("/dashboard");
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("list_review_articles");
  if (error) throw new Error("Unable to load the review queue.");
  return z
    .array(row)
    .max(100)
    .parse(data)
    .map((item) => ({
      id: item.article_id,
      title: item.title,
      status: item.status,
      ownerName: item.owner_name,
      sectionName: item.section_name,
      at: item.status === "draft" ? item.submitted_at : item.published_at,
    }));
}
