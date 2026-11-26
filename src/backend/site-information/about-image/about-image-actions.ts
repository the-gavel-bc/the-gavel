"use server";
import { revalidatePath } from "next/cache";
import { invalidatePublicShell } from "@/backend/public-site/public-shell-cache/public-shell-cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { acquireImageProcessing } from "@/backend/media/image-intake/processing-gate";
import { processAboutImage } from "./about-image-processing";

export type AboutImageResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "invalid_type"
        | "invalid_image"
        | "invalid_input"
        | "too_large"
        | "forbidden"
        | "unavailable";
    };

function outcome(data: unknown): AboutImageResult {
  if (typeof data === "object" && data !== null && "ok" in data && data.ok) {
    revalidatePath("/about");
    revalidatePath("/dashboard/admin/site");
    invalidatePublicShell();
    return { ok: true };
  }
  const code =
    typeof data === "object" && data !== null && "code" in data
      ? data.code
      : null;
  return {
    ok: false,
    code:
      code === "invalid_input" || code === "forbidden" ? code : "unavailable",
  };
}

// The form posts a file named "image" and its alt text named "alt".
export async function saveAboutImageAction(
  form: FormData,
): Promise<AboutImageResult> {
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const file = form.get("image");
    const alt = form.get("alt");
    if (!(file instanceof File)) return { ok: false, code: "invalid_image" };
    if (typeof alt !== "string" || !alt.trim())
      return { ok: false, code: "invalid_input" };
    // Decoding is memory-heavy: share the upload gate with article images.
    const release = acquireImageProcessing();
    if (!release) return { ok: false, code: "unavailable" };
    let processed;
    try {
      processed = await processAboutImage(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      );
    } finally {
      release();
    }
    if (!processed.ok) return processed;
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("set_site_about_image", {
      // PostgREST reads a hex string as bytea.
      p_bytes: `\\x${Buffer.from(processed.bytes).toString("hex")}`,
      p_alt: alt.trim(),
    });
    return error ? { ok: false, code: "unavailable" } : outcome(data);
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function removeAboutImageAction(): Promise<AboutImageResult> {
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("remove_site_about_image");
    return error ? { ok: false, code: "unavailable" } : outcome(data);
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
