import { expect, it } from "vitest";
import { contactMailto } from "./contact-link";
it.each([
  ["editor@bc.edu", "mailto:editor@bc.edu"],
  ["desk?letters@bc.edu", "mailto:desk%3Fletters@bc.edu"],
  ["a&body=b#c%20@bc.edu", "mailto:a%26body%3Db%23c%2520@bc.edu"],
])(
  "keeps the recipient delimiter and escapes local-part data once",
  (address, href) => {
    expect(contactMailto(address)).toBe(href);
  },
);
