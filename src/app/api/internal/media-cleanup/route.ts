import { timingSafeEqual } from "node:crypto";
import { runRetiredMediaCleanup } from "@/backend/media/retired-media-cleanup/retired-media-cleanup";
// The sweep is time-boxed to about 40 s; leave headroom for the probe and health check.
export const maxDuration = 60;
export async function GET(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== "production")
    return new Response(null, { status: 404 });
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = secret && secret.length >= 32 ? `Bearer ${secret}` : "";
  const a = Buffer.from(supplied),
    b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b))
    return new Response(null, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  const result = await runRetiredMediaCleanup();
  return Response.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
