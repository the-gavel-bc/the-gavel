import { expect, it } from "vitest";
import { parsePublicImageWidth, publicImageSrcSet } from "./public-image";

it("accepts only the listed widths", () => {
  expect(parsePublicImageWidth(null)).toBeNull();
  expect(parsePublicImageWidth("960")).toBe(960);
  for (const value of ["123", "0960", "960px", "", "-1"])
    expect(parsePublicImageWidth(value)).toBe("invalid");
});

it("lists smaller widths plus the original for public images only", () => {
  const src = "/api/public/articles/a/media/b";
  expect(publicImageSrcSet(src, 2400)).toBe(
    `${src}?w=480 480w, ${src}?w=960 960w, ${src}?w=1600 1600w, ${src} 2400w`,
  );
  expect(publicImageSrcSet(src, 900)).toBe(`${src}?w=480 480w, ${src} 900w`);
  expect(publicImageSrcSet(src, 400)).toBeUndefined();
  expect(publicImageSrcSet(src)).toBeUndefined();
  expect(publicImageSrcSet("/api/articles/a/media/b", 2400)).toBeUndefined();
});
