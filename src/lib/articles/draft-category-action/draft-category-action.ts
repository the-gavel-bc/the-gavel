"use server";
import { getCurrentAccess } from "@/lib/auth/access/access";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";
import { isDraftUuid } from "../draft-contract/draft-contract";
import {
  loadDraftCategories,
  type DraftOptions,
} from "../draft-options/draft-options";
export async function getDraftCategoriesAction(
  sectionId: string,
): Promise<
  | { ok: true; categories: DraftOptions["categories"] }
  | { ok: false; code: "invalid_input" | "forbidden" | "unavailable" }
> {
  if (!isDraftUuid(sectionId)) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    return {
      ok: true,
      categories: await loadDraftCategories(client, sectionId),
    };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
