import { execFileSync } from "node:child_process";
import { beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({
    createPublicReaderClient: () => ({ rpc: mocks.rpc }),
  }),
);
import { searchPublicArticles } from "@/backend/public-articles/public-search/public-search";

const workdir = process.env.SEARCH_CHECK_WORKDIR;
if (!/^\/(private\/)?tmp\/gavel-review-db-b6$/u.test(workdir ?? ""))
  throw new Error(
    "Set SEARCH_CHECK_WORKDIR to the disposable review DB project.",
  );

let apiUrl: string;
let anonKey: string;
beforeAll(() => {
  const status = JSON.parse(
    execFileSync(
      "pnpm",
      ["exec", "supabase", "status", "--workdir", workdir!, "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ) as { API_URL: string; ANON_KEY: string };
  expect(status.API_URL).toBe("http://127.0.0.1:58721");
  apiUrl = status.API_URL;
  anonKey = status.ANON_KEY;
  mocks.rpc.mockImplementation((name: string, params: unknown) => {
    expect(name).toBe("search_public_articles");
    return {
      abortSignal: async () => {
        const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });
        return { data: await response.json(), error: null };
      },
    };
  });
});

it("accepts the real anonymous RPC response through the production parser", async () => {
  expect(await searchPublicArticles({ query: "word" })).toMatchObject({
    kind: "ok",
    query: "word",
  });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("search_public_articles", {
    p_query: "word",
    p_limit: 12,
    p_cursor: null,
  });
});
