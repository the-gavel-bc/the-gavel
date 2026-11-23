"use server";

import { getCurrentAccess } from "@/backend/auth/access/access";
import { getHomepageLibraryPage } from "@/backend/articles/admin-article-queries/admin-article-queries";
import { getHomepageImageUrls } from "./homepage-images";

export type LibraryStory = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  imageUrl: string | null;
};
export type LibraryPage = { items: LibraryStory[]; nextCursor: string | null };
export type LibraryResult =
  | ({ ok: true } & LibraryPage)
  | { ok: false; code: "forbidden" | "invalid_input" | "unavailable" };

// One page of published stories for the curation library, with images.
export async function listHomepageStoriesAction(input: {
  search?: string;
  cursor?: string;
}): Promise<LibraryResult> {
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const page = await getHomepageLibraryPage({
      ...(input.search ? { search: input.search } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    });
    const images = await getHomepageImageUrls(page.items.map((a) => a.id));
    return {
      ok: true,
      items: page.items.map((a) => ({
        id: a.id,
        title: a.title,
        status: "published",
        imageUrl: images[a.id] ?? null,
      })),
      nextCursor: page.nextCursor,
    };
  } catch (error) {
    // The query helpers throw for malformed search or cursor values.
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      code: message.startsWith("Invalid") ? "invalid_input" : "unavailable",
    };
  }
}
