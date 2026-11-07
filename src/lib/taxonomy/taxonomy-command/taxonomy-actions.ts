"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/lib/auth/access/access";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";
import {
  parseTaxonomyCommand,
  parseTaxonomyResult,
  type TaxonomyCommand,
  type TaxonomyResult,
} from "./taxonomy-command";

export async function updateTaxonomyAction(
  command: TaxonomyCommand,
): Promise<TaxonomyResult> {
  const parsed = parseTaxonomyCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const value = parsed.value;
    const args = {
      p_id: value.id,
      p_expected_version: value.expectedVersion,
      p_request_id: value.requestId,
      p_name: value.name,
      p_navigation_order: value.navigationOrder,
      p_active: value.active,
    };
    const { data, error } =
      value.kind === "section"
        ? await client.rpc("update_section_taxonomy", args)
        : await client.rpc("update_category_taxonomy", args);
    if (error) return { ok: false, code: "unavailable" };
    const result = parseTaxonomyResult(data, value);
    if (result.ok) revalidatePath("/dashboard/admin/taxonomy");
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
