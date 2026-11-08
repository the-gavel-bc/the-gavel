export async function readMediaFile(
  request: Request,
): Promise<
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; code: "invalid_input" | "too_large" }
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
  try {
    while (true) {
      const { value, done } = await reader.read();
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
    reader.releaseLock();
  }
}
