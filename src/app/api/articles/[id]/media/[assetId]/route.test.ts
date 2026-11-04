// @vitest-environment node
import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
import { processArticleImage } from "@/lib/media/image-intake/image-intake";
import { GET, POST } from "./route";

const articleId = "50000000-0000-0000-0000-000000000401";
const assetId = "60000000-0000-0000-0000-000000000401";
const userId = "00000000-0000-0000-0000-000000000002";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  asset: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  finalize: vi.fn(),
  claim: vi.fn(),
  userClient: vi.fn(),
  trustedClient: vi.fn(),
}));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: mocks.access }));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.userClient,
}));
vi.mock("@/lib/supabase/media-admin/media-admin", () => ({
  createTrustedMediaClient: mocks.trustedClient,
}));

async function uploadRequest() {
  const bytes = await sharp({
    create: { width: 2, height: 3, channels: 3, background: "#234567" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "ignored.png");
  return new Request("http://localhost/api/articles/media", {
    method: "POST",
    body: form,
  });
}
const routeParams = { params: Promise.resolve({ id: articleId, assetId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    status: "active",
    userId,
    profileId: "10000000-0000-0000-0000-000000000002",
    role: "author",
  });
  mocks.asset.mockResolvedValue({
    data: {
      id: assetId,
      article_id: articleId,
      uploader_user_id: userId,
      object_key: `${articleId}/${assetId}.webp`,
      status: "pending",
    },
    error: null,
  });
  mocks.userClient.mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.asset }) }),
    }),
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.finalize.mockResolvedValue({
    data: { ok: true, assetId, replayed: false },
    error: null,
  });
  mocks.claim.mockResolvedValue({
    data: { ok: true, assetId, replayed: false },
    error: null,
  });
  mocks.trustedClient.mockReturnValue({
    storage: {
      from: () => ({ upload: mocks.upload, download: mocks.download }),
    },
    rpc: (name: string, args: unknown) =>
      name === "begin_article_image_upload"
        ? mocks.claim(name, args)
        : mocks.finalize(name, args),
  });
});

it("serves only finalized same-article WebP through the user-scoped client", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  mocks.asset.mockResolvedValue({
    data: {
      id: assetId,
      article_id: articleId,
      object_key: "private/image.webp",
      status: "finalized",
    },
    error: null,
  });
  mocks.download.mockResolvedValue({
    data: new Blob([bytes], { type: "image/webp" }),
    error: null,
  });
  mocks.userClient.mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.asset }) }),
    }),
    storage: { from: () => ({ download: mocks.download }) },
  });
  const response = await GET(
    new Request("http://localhost/private"),
    routeParams,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/webp");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(mocks.trustedClient).not.toHaveBeenCalled();
});

it("hides pending and foreign assets from private preview", async () => {
  for (const data of [
    {
      id: assetId,
      article_id: articleId,
      object_key: "private/a.webp",
      status: "pending",
    },
    {
      id: assetId,
      article_id: "50000000-0000-0000-0000-000000000402",
      object_key: "private/a.webp",
      status: "finalized",
    },
  ]) {
    mocks.asset.mockResolvedValue({ data, error: null });
    const response = await GET(
      new Request("http://localhost/private"),
      routeParams,
    );
    expect(response.status).toBe(404);
  }
  expect(mocks.download).not.toHaveBeenCalled();
});

it("denies unauthenticated upload before reading or creating trusted client", async () => {
  mocks.access.mockResolvedValue({ status: "signedOut" });
  const response = await POST(await uploadRequest(), routeParams);
  expect(response.status).toBe(403);
  expect(mocks.userClient).not.toHaveBeenCalled();
  expect(mocks.trustedClient).not.toHaveBeenCalled();
});

it("does not upload an asset belonging to another article", async () => {
  mocks.asset.mockResolvedValue({
    data: {
      id: assetId,
      article_id: "50000000-0000-0000-0000-000000000402",
      uploader_user_id: userId,
      object_key: "private/path.webp",
      status: "pending",
    },
    error: null,
  });
  const response = await POST(await uploadRequest(), routeParams);
  expect(response.status).toBe(404);
  expect(mocks.trustedClient).not.toHaveBeenCalled();
});

it("does not upload when cleanup wins before the trusted claim", async () => {
  mocks.claim.mockResolvedValue({
    data: { ok: false, code: "conflict" },
    error: null,
  });
  const response = await POST(await uploadRequest(), routeParams);
  expect(response.status).toBe(409);
  expect(mocks.upload).not.toHaveBeenCalled();
});

it("uploads only decoded WebP and finalizes the owned reservation", async () => {
  const response = await POST(await uploadRequest(), routeParams);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, assetId, replayed: false });
  const [key, bytes, options] = mocks.upload.mock.calls[0];
  expect(key).toBe(`${articleId}/${assetId}.webp`);
  expect((await sharp(bytes).metadata()).format).toBe("webp");
  expect(options).toMatchObject({ contentType: "image/webp", upsert: false });
  expect(mocks.finalize).toHaveBeenCalledOnce();
  expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.upload.mock.invocationCallOrder[0],
  );
});

it("rejects mismatched declared MIME before opening trusted Storage", async () => {
  const form = new FormData();
  const png = await sharp({
    create: { width: 2, height: 3, channels: 3, background: "#234567" },
  })
    .png()
    .toBuffer();
  form.append("file", new Blob([png], { type: "image/jpeg" }), "wrong.jpg");
  const response = await POST(
    new Request("http://localhost/api/articles/media", {
      method: "POST",
      body: form,
    }),
    routeParams,
  );
  expect(response.status).toBe(400);
  expect(mocks.trustedClient).not.toHaveBeenCalled();
});

it("retries finalization after a matching Storage upload lost its response", async () => {
  const original = await sharp({
    create: { width: 2, height: 3, channels: 3, background: "#234567" },
  })
    .png()
    .toBuffer();
  const processed = await processArticleImage(original, "image/png");
  if (!processed.ok) throw new Error("Synthetic fixture failed.");
  mocks.upload.mockResolvedValue({ error: { message: "already exists" } });
  mocks.download.mockResolvedValue({
    data: new Blob([Uint8Array.from(processed.bytes).buffer]),
    error: null,
  });
  const response = await POST(await uploadRequest(), routeParams);
  expect(response.status).toBe(200);
  expect(mocks.finalize).toHaveBeenCalledOnce();
});
