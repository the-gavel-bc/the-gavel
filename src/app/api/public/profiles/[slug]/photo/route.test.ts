import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({
    createPublicReaderClient: () => ({ rpc: mocks.rpc }),
  }),
);
import { GET, HEAD } from "./route";

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([4, 0, 0, 0]),
  Buffer.from("WEBP"),
]);
beforeEach(() => vi.clearAllMocks());

it("serves stored WebP without caching so profile hiding can take effect", async () => {
  mocks.rpc.mockResolvedValue({
    data: [{ bytes: `\\x${webp.toString("hex")}`, updated_at: "2026-11-17" }],
    error: null,
  });
  const response = await GET(new Request("http://x"), ctx("jane-doe"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(Buffer.from(await response.arrayBuffer()).equals(webp)).toBe(true);
  const head = await HEAD(new Request("http://x"), ctx("jane-doe"));
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
});

it("is 404 for no photo or a bad slug and 503 on failure, never cached", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  const none = await GET(new Request("http://x"), ctx("jane-doe"));
  expect(none.status).toBe(404);
  expect(none.headers.get("cache-control")).toBe("private, no-store");
  const bad = await GET(new Request("http://x"), ctx("Bad Slug!"));
  expect(bad.status).toBe(404);
  expect(mocks.rpc).toHaveBeenCalledOnce();
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "x" } });
  expect((await GET(new Request("http://x"), ctx("jane-doe"))).status).toBe(
    503,
  );
});
