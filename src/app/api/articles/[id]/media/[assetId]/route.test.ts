// @vitest-environment node
import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
import { processArticleImage } from "@/backend/media/image-intake/image-intake";
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
  admit: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  userClient: vi.fn(),
  trustedClient: vi.fn(),
}));
vi.mock("@/backend/media/image-intake/processing-gate", () => ({
  acquireImageProcessing: mocks.acquire,
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.userClient,
}));
vi.mock("@/backend/infrastructure/supabase/media-admin/media-admin", () => ({
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
  mocks.acquire.mockReturnValue(mocks.release);
  mocks.admit.mockResolvedValue({
    data: { ok: true, replayed: false },
    error: null,
  });
  mocks.userClient.mockResolvedValue({
    rpc: mocks.admit,
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

it("reports an unavailable private preview without using the trusted client", async () => {
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
    data: null,
    error: new Error("storage unavailable"),
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
  expect(response.status).toBe(503);
  expect(mocks.trustedClient).not.toHaveBeenCalled();
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
  expect(options).toMatchObject({
    contentType: "image/webp",
    upsert: false,
    headers: { "cache-control": "no-store" },
  });
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

it.each([
  [{ ok: false, code: "rate_limited", retryAfter: 42 }, 429],
  [{ ok: false, code: "forbidden" }, 403],
  [{ ok: false, code: "not_found" }, 404],
  [{ ok: false, code: "conflict" }, 409],
])(
  "refuses admission before buffering or processing: %j",
  async (result, status) => {
    mocks.admit.mockResolvedValue({ data: result, error: null });
    const request = await uploadRequest();
    const read = vi.spyOn(request.body!, "getReader");
    const response = await POST(request, routeParams);
    expect(response.status).toBe(status);
    expect(read).not.toHaveBeenCalled();
    expect(mocks.trustedClient).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
    if (status === 429) {
      expect(response.headers.get("Retry-After")).toBe("42");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  },
);
it("refuses local overload before reading or spending quota", async () => {
  mocks.acquire.mockReturnValue(null);
  const request = await uploadRequest();
  const read = vi.spyOn(request.body!, "getReader");
  expect((await POST(request, routeParams)).status).toBe(503);
  expect(mocks.admit).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
it("releases a processing slot when admission fails unexpectedly", async () => {
  mocks.admit.mockRejectedValue(new Error("private transport"));
  expect((await POST(await uploadRequest(), routeParams)).status).toBe(503);
  expect(mocks.release).toHaveBeenCalledOnce();
});
it("does not process a finalized replay discovered at admission", async () => {
  mocks.admit.mockResolvedValue({
    data: { ok: true, replayed: true },
    error: null,
  });
  const request = await uploadRequest();
  const read = vi.spyOn(request.body!, "getReader");
  const response = await POST(request, routeParams);
  expect(await response.json()).toEqual({ ok: true, assetId, replayed: true });
  expect(read).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledOnce();
});

it.each(["begin", "finalize"])(
  "maps %s business failures without retryable 503",
  async (stage) => {
    for (const [code, status] of [
      ["forbidden", 403],
      ["not_found", 404],
      ["conflict", 409],
      ["request_conflict", 409],
      ["invalid_input", 400],
    ] as const) {
      const target = stage === "begin" ? mocks.claim : mocks.finalize;
      target.mockResolvedValueOnce({ data: { ok: false, code }, error: null });
      const response = await POST(await uploadRequest(), {
        params: Promise.resolve({ id: articleId, assetId }),
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ok: false, code });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  },
);

it("refuses a cross-origin browser upload before doing any work", async () => {
  const base = await uploadRequest();
  const crossSite = new Request(base.url, {
    method: "POST",
    body: await base.arrayBuffer(),
    headers: {
      "content-type": base.headers.get("content-type")!,
      origin: "https://evil.example",
      host: "localhost",
    },
  });
  const response = await POST(crossSite, routeParams);
  expect(response.status).toBe(403);
  expect(mocks.acquire).not.toHaveBeenCalled();
  expect(mocks.trustedClient).not.toHaveBeenCalled();
});

it.each([
  ["pending membership", { status: "pending" }, 403],
  ["signed out", { status: "signedOut" }, 403],
])(
  "denies %s before touching the database or Storage",
  async (_label, access, status) => {
    mocks.access.mockResolvedValue(access);
    const response = await POST(await uploadRequest(), routeParams);
    expect(response.status).toBe(status);
    expect(mocks.userClient).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  },
);

it.each(["author", "editor"])(
  "a %s cannot process another member's reservation",
  async (role) => {
    mocks.access.mockResolvedValue({
      status: "active",
      userId: "00000000-0000-0000-0000-000000000009",
      profileId: "10000000-0000-0000-0000-000000000009",
      role,
    });
    const response = await POST(await uploadRequest(), routeParams);
    expect(response.status).toBe(404);
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  },
);

it("lets an administrator process another member's reservation", async () => {
  mocks.access.mockResolvedValue({
    status: "active",
    userId: "00000000-0000-0000-0000-000000000009",
    profileId: "10000000-0000-0000-0000-000000000009",
    role: "administrator",
  });
  const response = await POST(await uploadRequest(), routeParams);
  expect(response.status).toBe(200);
});

it("answers 408 when the body stops arriving", async () => {
  const stalled = new Request("http://localhost/api/articles/media", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
    }),
    duplex: "half",
  } as RequestInit);
  vi.useFakeTimers();
  const pending = POST(stalled, routeParams);
  await vi.advanceTimersByTimeAsync(16_000);
  const response = await pending;
  vi.useRealTimers();
  expect(response.status).toBe(408);
  expect(mocks.release).toHaveBeenCalled();
});
