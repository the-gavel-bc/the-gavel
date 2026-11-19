import { timingSafeEqual } from "node:crypto";

// Scheduled routes run only in production, and only with the configured
// secret. Returns the refusal to send, or null when the caller may proceed.
export function refuseCronRequest(request: Request): Response | null {
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
  return null;
}
