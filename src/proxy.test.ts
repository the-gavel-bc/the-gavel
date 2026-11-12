import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SITE_URL: "https://gavel.example",
  }),
}));
vi.mock("@/backend/infrastructure/supabase/proxy/proxy", () => ({
  refreshSession: refresh,
}));
import { config, proxy } from "./proxy";

const nonceOf = (policy: string | null) =>
  policy?.match(/'nonce-([^']+)'/)?.[1] ?? null;
beforeEach(() => {
  refresh.mockReset();
  refresh.mockImplementation(async () => NextResponse.next());
});

it("sends a nonce policy on public documents and forwards it to rendering", async () => {
  const response = await proxy(
    new NextRequest("https://gavel.example/articles/story"),
  );
  const policy = response.headers.get("Content-Security-Policy");
  expect(nonceOf(policy)).toBeTruthy();
  expect(policy).toContain("frame-ancestors 'none'");
  // NextResponse.next({ request: { headers } }) exposes overridden request headers.
  expect(
    response.headers.get("x-middleware-request-content-security-policy"),
  ).toBe(policy);
  expect(refresh).not.toHaveBeenCalled();
});

it.each([
  "/dashboard",
  "/dashboard/articles/new",
  "/sign-in",
  "/auth/callback",
  "/access-pending",
])(
  "still refreshes the session on %s and passes the same policy along",
  async (path) => {
    const response = await proxy(
      new NextRequest(`https://gavel.example${path}`),
    );
    const policy = response.headers.get("Content-Security-Policy");
    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh.mock.calls[0][1]).toEqual({
      "content-security-policy": policy,
    });
  },
);

it("does not treat lookalike paths as session routes", async () => {
  await proxy(new NextRequest("https://gavel.example/dashboardx"));
  await proxy(new NextRequest("https://gavel.example/sign-in-help"));
  expect(refresh).not.toHaveBeenCalled();
});

it("uses a fresh nonce for every request", async () => {
  const nonces = new Set<string | null>();
  for (let i = 0; i < 5; i++)
    nonces.add(
      nonceOf(
        (await proxy(new NextRequest("https://gavel.example/"))).headers.get(
          "Content-Security-Policy",
        ),
      ),
    );
  expect(nonces.size).toBe(5);
});

it("keeps session routes matched for prefetches and skips APIs and static files", () => {
  const [, , , , documents] = config.matcher as [
    string,
    string,
    string,
    string,
    { source: string },
  ];
  expect(config.matcher.slice(0, 4)).toEqual([
    "/dashboard/:path*",
    "/sign-in",
    "/auth/callback",
    "/access-pending",
  ]);
  const pattern = new RegExp(`^${documents.source}$`);
  for (const path of ["/", "/articles/a", "/search", "/about"])
    expect(pattern.test(path)).toBe(true);
  for (const path of [
    "/api/public/articles/a/media/b",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
  ])
    expect(pattern.test(path)).toBe(false);
});
