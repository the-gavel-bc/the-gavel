"use server";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/lib/auth/access/access";
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
  | { ok: false; code: "invalid_input" | "unavailable" }
> {
  if (!isDraftUuid(sectionId)) return { ok: false, code: "invalid_input" };
  try {
    await requireActiveMembership();
    const client = await createServerSupabaseClient();
    return {
      ok: true,
      categories: await loadDraftCategories(client, sectionId),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, code: "unavailable" };
  }
}
