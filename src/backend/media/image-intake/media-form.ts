import "server-only";

// A client that stops sending must not hold a processing slot indefinitely.
export const BODY_DEADLINE_MS = 15_000;

export async function readMediaFile(
  request: Request,
  deadlineMs = BODY_DEADLINE_MS,
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; code: "invalid_input" | "too_large" | "timeout" }
> {
  const maxFileBytes = 10 * 1024 * 1024;
  const maxBodyBytes = maxFileBytes + 128 * 1024;
  const contentType = request.headers.get("content-type");
  if (
    !contentType?.startsWith("multipart/form-data;") ||
    !contentType.includes("boundary=")
  )
    return { ok: false, code: "invalid_input" };
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength))
      return { ok: false, code: "invalid_input" };
    if (Number(declaredLength) > maxBodyBytes)
      return { ok: false, code: "too_large" };
  }
  if (!request.body) return { ok: false, code: "invalid_input" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), deadlineMs);
  });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), expired]);
      if (next === "timeout") {
        await reader.cancel().catch(() => {});
        return { ok: false, code: "timeout" };
      }
      const { value, done } = next;
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return { ok: false, code: "too_large" };
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": contentType },
      body: Buffer.from(body),
    });
    const fields = [...(await parsed.formData()).entries()];
    if (
      fields.length !== 1 ||
      fields[0][0] !== "file" ||
      !(fields[0][1] instanceof File)
    )
      return { ok: false, code: "invalid_input" };
    const file = fields[0][1];
    if (file.size > maxFileBytes) return { ok: false, code: "too_large" };
    return {
      ok: true,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
    };
  } catch {
    return { ok: false, code: "invalid_input" };
  } finally {
    clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      // A cancelled reader may already be released.
    }
  }
}
