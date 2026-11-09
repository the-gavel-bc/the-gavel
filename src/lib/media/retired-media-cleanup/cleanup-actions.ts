"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/lib/auth/access/access";
import { runRetiredMediaCleanup } from "./retired-media-cleanup";
export async function retryMediaCleanupAction(): Promise<{ ok: boolean }> {
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false };
    if (
      process.env.VERCEL_ENV !== "production" &&
      (process.env.VERCEL_ENV !== undefined ||
        process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
    )
      return { ok: false };
    if (
      process.env.VERCEL_ENV === "production" &&
      (process.env.CRON_SECRET?.length ?? 0) < 32
    )
      return { ok: false };
    const result = await runRetiredMediaCleanup();
    revalidatePath("/dashboard/admin/media-cleanup");
    return result;
  } catch {
    return { ok: false };
  }
}
