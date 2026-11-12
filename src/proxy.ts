import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import {
  contentSecurityPolicy,
  createNonce,
} from "@/backend/infrastructure/security/content-security-policy/content-security-policy";
import { refreshSession } from "@/backend/infrastructure/supabase/proxy/proxy";

const sessionRoute =
  /^\/(?:dashboard(?:\/.*)?|sign-in|auth\/callback|access-pending)$/;

export async function proxy(request: NextRequest) {
  const env = getServerEnv();
  const policy = contentSecurityPolicy({
    nonce: createNonce(),
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    siteUrl: env.SITE_URL,
    development: process.env.NODE_ENV === "development",
  });
  // Next.js reads the nonce from this request header and applies it to its own
  // scripts and styles; the response header is what the browser enforces.
  const csp = { "content-security-policy": policy };
  let response: NextResponse;
  if (sessionRoute.test(request.nextUrl.pathname)) {
    response = await refreshSession(request, csp);
  } else {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy", policy);
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    // Session routes keep running for every request, including prefetches.
    "/dashboard/:path*",
    "/sign-in",
    "/auth/callback",
    "/access-pending",
    // Every other document, skipping APIs, static assets and Link prefetches.
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
