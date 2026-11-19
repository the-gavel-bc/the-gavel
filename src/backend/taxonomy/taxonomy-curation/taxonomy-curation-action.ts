"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  parseCurationResult,
  parseTaxonomyCuration,
  type CurationResult,
  type TaxonomyCuration,
} from "../../../shared/taxonomy/taxonomy-curation/taxonomy-curation";

// Create sections and categories; rename, merge and delete tags.
export async function curateTaxonomyAction(
  command: TaxonomyCuration,
): Promise<CurationResult> {
  const parsed = parseTaxonomyCuration(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const value = parsed.value;
    const call = (() => {
      switch (value.kind) {
        case "createSection":
          return client.rpc("create_taxonomy", {
            p_kind: "section",
            p_request_id: value.requestId,
            p_name: value.name,
            p_navigation_order: value.navigationOrder,
          });
        case "createCategory":
          return client.rpc("create_taxonomy", {
            p_kind: "category",
            p_request_id: value.requestId,
            p_name: value.name,
            p_navigation_order: value.navigationOrder,
            p_parent_id: value.sectionId,
          });
        case "renameTag":
          return client.rpc("rename_tag", {
            p_id: value.id,
            p_request_id: value.requestId,
            p_name: value.name,
          });
        case "mergeTags":
          return client.rpc("merge_tags", {
            p_source_id: value.id,
            p_target_id: value.targetId,
            p_request_id: value.requestId,
          });
        case "deleteTag":
          return client.rpc("delete_unused_tag", {
            p_id: value.id,
            p_request_id: value.requestId,
          });
      }
    })();
    const { data, error } = await call;
    if (error) return { ok: false, code: "unavailable" };
    const result = parseCurationResult(data);
    if (result.ok) revalidatePath("/dashboard/admin/taxonomy");
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
