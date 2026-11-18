"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { acquireImageProcessing } from "@/backend/media/image-intake/processing-gate";
import { processProfilePhoto } from "./profile-photo";

export type ProfilePhotoResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "invalid_type"
        | "invalid_image"
        | "too_large"
        | "forbidden"
        | "rate_limited"
        | "unavailable";
    };

// The form posts one file named "photo". Only the signed-in member's own
// profile can change; the database function enforces that independently.
export async function saveProfilePhotoAction(
  form: FormData,
): Promise<ProfilePhotoResult> {
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const file = form.get("photo");
    if (!(file instanceof File)) return { ok: false, code: "invalid_image" };
    // Decoding is memory-heavy: share the article upload gate so a burst of
    // photo changes cannot exhaust the instance.
    const release = acquireImageProcessing();
    if (!release) return { ok: false, code: "unavailable" };
    let processed;
    try {
      processed = await processProfilePhoto(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      );
    } finally {
      release();
    }
    if (!processed.ok) return processed;
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("set_own_profile_photo", {
      // PostgREST reads a hex string as bytea.
      p_bytes: `\\x${Buffer.from(processed.bytes).toString("hex")}`,
    });
    if (error) return { ok: false, code: "unavailable" };
    const ok =
      typeof data === "object" && data !== null && "ok" in data && data.ok;
    if (!ok)
      return {
        ok: false,
        code:
          typeof data === "object" &&
          data !== null &&
          "code" in data &&
          data.code === "rate_limited"
            ? "rate_limited"
            : "forbidden",
      };
    revalidatePath("/dashboard/profile");
    return { ok: true };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function removeProfilePhotoAction(): Promise<ProfilePhotoResult> {
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("remove_own_profile_photo");
    if (error) return { ok: false, code: "unavailable" };
    const ok =
      typeof data === "object" && data !== null && "ok" in data && data.ok;
    if (!ok) return { ok: false, code: "forbidden" };
    revalidatePath("/dashboard/profile");
    return { ok: true };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
