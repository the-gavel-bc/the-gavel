"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { runRetiredMediaCleanup } from "./retired-media-cleanup";
export async function retryMediaCleanupAction(): Promise<
  { ok: true } | { ok: false; code: "forbidden" | "environment" | "failed" }
> {
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const localPort = process.env.GAVEL_SUPABASE_API_PORT ?? "54321";
    const localApi =
      /^[1-9][0-9]{0,4}$/.test(localPort) &&
      Number(localPort) <= 65535 &&
      process.env.NEXT_PUBLIC_SUPABASE_URL === `http://127.0.0.1:${localPort}`;
    if (
      process.env.VERCEL_ENV !== "production" &&
      (process.env.VERCEL_ENV !== undefined || !localApi)
    )
      return { ok: false, code: "environment" };
    if (
      process.env.VERCEL_ENV === "production" &&
      (process.env.CRON_SECRET?.length ?? 0) < 32
    )
      return { ok: false, code: "environment" };
    const result = await runRetiredMediaCleanup();
    revalidatePath("/dashboard/admin/media-cleanup");
    return result.ok ? { ok: true } : { ok: false, code: "failed" };
  } catch {
    return { ok: false, code: "failed" };
  }
}
