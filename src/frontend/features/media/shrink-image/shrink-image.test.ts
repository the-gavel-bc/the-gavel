import { expect, it } from "vitest";
import { shrinkImage } from "./shrink-image";

it("passes small files through and rejects large ones it cannot decode", async () => {
  const small = new File([new Uint8Array(10)], "a.png", { type: "image/png" });
  await expect(shrinkImage(small)).resolves.toEqual({ ok: true, file: small });
  const large = new File([new Uint8Array(4 * 1024 * 1024)], "b.jpg", {
    type: "image/jpeg",
  });
  await expect(shrinkImage(large)).resolves.toEqual({ ok: false });
});
