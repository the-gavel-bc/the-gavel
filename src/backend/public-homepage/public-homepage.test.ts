import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({ createPublicReaderClient: () => ({ rpc: mocks.rpc }) }),
);
import { getPublicHomepage, getPublicReadThis } from "./public-homepage";
const card = {
  id: "58000000-0000-0000-0000-000000000040",
  slug: "story",
  title: "Story",
  excerpt: null,
  publishedAt: "2026-11-09T00:00:00.123456Z",
  section: { name: "News", slug: "news" },
  owner: { displayName: "Writer", slug: "writer" },
  writers: [],
  mainImage: null,
};
const empty = {
  kind: "ok",
  lead: null,
  featured: [],
  readThis: [],
  latest: [],
  sections: [],
};
beforeEach(() => vi.resetAllMocks());
it("accepts empty and sparse coherent homepage data", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: empty, error: null })
    .mockResolvedValueOnce({
      data: {
        ...empty,
        lead: card,
        sections: [{ name: "News", slug: "news", articles: [card] }],
      },
      error: null,
    });
  expect(await getPublicHomepage()).toEqual(empty);
  expect((await getPublicHomepage()).kind).toBe("ok");
  expect(mocks.rpc).toHaveBeenCalledWith("get_public_homepage");
});
it("rejects repeated curated stories and mismatched section rows", async () => {
  mocks.rpc
    .mockResolvedValueOnce({
      data: { ...empty, lead: card, featured: [card] },
      error: null,
    })
    .mockResolvedValueOnce({
      data: {
        ...empty,
        sections: [{ name: "Sports", slug: "sports", articles: [card] }],
      },
      error: null,
    });
  expect(await getPublicHomepage()).toEqual({ kind: "unavailable" });
  expect(await getPublicHomepage()).toEqual({ kind: "unavailable" });
});
it("hides private fields and oversized arrays", async () => {
  mocks.rpc
    .mockResolvedValueOnce({
      data: { ...empty, saved: { secret: true } },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { ...empty, featured: Array(5).fill(card) },
      error: null,
    });
  expect(await getPublicHomepage()).toEqual({ kind: "unavailable" });
  expect(await getPublicHomepage()).toEqual({ kind: "unavailable" });
});
it("returns unavailable for errors and malformed responses", async () => {
  mocks.rpc
    .mockRejectedValueOnce(new Error("private SQL detail"))
    .mockResolvedValueOnce({ data: null, error: null });
  expect(await getPublicHomepage()).toEqual({ kind: "unavailable" });
  expect(await getPublicHomepage()).toEqual({ kind: "unavailable" });
});

it("loads empty and populated Read This without composing the homepage", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: { kind: "ok", readThis: [] }, error: null })
    .mockResolvedValueOnce({
      data: { kind: "ok", readThis: [card] },
      error: null,
    });
  expect(await getPublicReadThis()).toEqual({ kind: "ok", readThis: [] });
  expect(await getPublicReadThis()).toEqual({ kind: "ok", readThis: [card] });
  expect(mocks.rpc.mock.calls).toEqual([
    ["get_public_read_this"],
    ["get_public_read_this"],
  ]);
});
it.each([
  { kind: "ok", readThis: [card, card] },
  { kind: "ok", readThis: Array(5).fill(card) },
  { kind: "ok", readThis: [{ ...card, object_key: "private" }] },
  { kind: "ok", readThis: [{ ...card, slug: "../private" }] },
  { kind: "ok", readThis: [card], latest: [] },
  { kind: "ok", readThis: [null] },
  null,
])("rejects unsafe or incoherent footer data: %j", async (data) => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  expect(await getPublicReadThis()).toEqual({ kind: "unavailable" });
});
it("fails closed on footer errors and recovers on a subsequent request", async () => {
  mocks.rpc
    .mockRejectedValueOnce(new Error("private detail"))
    .mockResolvedValueOnce({
      data: { kind: "ok", readThis: [] },
      error: { message: "private detail" },
    })
    .mockResolvedValueOnce({ data: { kind: "unavailable" }, error: null })
    .mockResolvedValueOnce({
      data: { kind: "ok", readThis: [card] },
      error: null,
    });
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(await getPublicReadThis()).toEqual({ kind: "unavailable" });
  }
  expect(await getPublicReadThis()).toEqual({ kind: "ok", readThis: [card] });
});
