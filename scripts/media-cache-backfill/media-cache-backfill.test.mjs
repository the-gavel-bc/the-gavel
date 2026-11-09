import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { backfillAsset } from "./media-cache-backfill.mjs";

const bytes = Buffer.from("synthetic webp");
const asset = {
  id: "66000000-0000-0000-0000-000000000038",
  article_id: "56000000-0000-0000-0000-000000000038",
  object_key:
    "56000000-0000-0000-0000-000000000038/66000000-0000-0000-0000-000000000038.webp",
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
const response = (cache) =>
  new Response(bytes, {
    headers: {
      "content-type": "image/webp",
      "content-length": String(bytes.length),
      "cache-control": cache,
    },
  });
function setup() {
  const update = vi.fn().mockResolvedValue({ error: null });
  const single = vi.fn().mockResolvedValue({
    data: { ...asset, status: "finalized" },
    error: null,
  });
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
    storage: { from: () => ({ update }) },
  };
  return { client, update, single };
}
describe("maintenance cache backfill", () => {
  it("verifies bytes and headers before and after rewriting identical data", async () => {
    const { client, update } = setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response("max-age=3600"))
      .mockResolvedValueOnce(response("no-store"));
    expect(
      await backfillAsset(client, "http://127.0.0.1", "secret", asset, fetcher),
    ).toBe("updated");
    expect(update).toHaveBeenCalledWith(asset.object_key, bytes, {
      contentType: "image/webp",
      headers: { "cache-control": "no-store" },
    });
  });
  it("does not rewrite hash mismatches or assets changed since the scan", async () => {
    const { client, update, single } = setup();
    await expect(
      backfillAsset(
        client,
        "http://127.0.0.1",
        "secret",
        { ...asset, sha256: "bad" },
        async () => response("max-age=3600"),
      ),
    ).rejects.toThrow("hash mismatch");
    single.mockResolvedValue({
      data: { ...asset, status: "deleting" },
      error: null,
    });
    await expect(
      backfillAsset(client, "http://127.0.0.1", "secret", asset, async () =>
        response("max-age=3600"),
      ),
    ).rejects.toThrow("Asset changed");
    expect(update).not.toHaveBeenCalled();
  });
  it("resumes completed objects without rewriting", async () => {
    const { client, update } = setup();
    expect(
      await backfillAsset(
        client,
        "http://127.0.0.1",
        "secret",
        asset,
        async () => response("no-store"),
      ),
    ).toBe("verified");
    expect(update).not.toHaveBeenCalled();
  });
});
