import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy/proxy";
export async function proxy(request: NextRequest) {
  return refreshSession(request);
}
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sign-in",
    "/auth/callback",
    "/access-pending",
  ],
};
