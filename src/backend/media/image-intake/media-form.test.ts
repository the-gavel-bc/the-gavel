// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readMediaFile } from "./media-form";

function multipart(bytes: Uint8Array, type = "image/png") {
  const form = new FormData();
  form.append(
    "file",
    new Blob([Uint8Array.from(bytes).buffer], { type }),
    "untrusted-name.png",
  );
  return new Request("http://localhost/api/media", {
    method: "POST",
    body: form,
  });
}

describe("readMediaFile", () => {
  it("returns only the file bytes and declared content type", async () => {
    const result = await readMediaFile(multipart(new Uint8Array([1, 2, 3])));
    expect(result).toEqual({
      ok: true,
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
  });

  it("rejects a multipart request with extra fields", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1])], { type: "image/png" }));
    form.append("ownerId", "forged");
    const result = await readMediaFile(
      new Request("http://localhost/api/media", { method: "POST", body: form }),
    );
    expect(result).toEqual({ ok: false, code: "invalid_input" });
  });

  it("rejects an absent file", async () => {
    const result = await readMediaFile(
      new Request("http://localhost/api/media", {
        method: "POST",
        body: new FormData(),
      }),
    );
    expect(result).toEqual({ ok: false, code: "invalid_input" });
  });

  it("bounds the request stream even without Content-Length", async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024 + 128 * 1024 + 1);
    const request = new Request("http://localhost/api/media", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=synthetic" },
      body: bytes,
    });
    expect(await readMediaFile(request)).toEqual({
      ok: false,
      code: "too_large",
    });
  });
});
