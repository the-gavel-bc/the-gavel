import { describe, expect, it } from "vitest";
import {
  decodeDraftCursor,
  encodeDraftCursor,
  isDatabaseTimestamp,
} from "./draft-cursor";
const id = "00000000-0000-0000-0000-000000000001";
const updatedAt = "2026-10-22T12:34:56.123456+00:00";
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
describe("draft cursor", () => {
  it("preserves database microseconds in an opaque versioned cursor", () => {
    const cursor = encodeDraftCursor({ id, updatedAt });
    expect(decodeDraftCursor(cursor)).toEqual({ version: 1, id, updatedAt });
    expect(cursor).not.toContain(updatedAt);
  });
  it.each([
    null,
    "",
    "x".repeat(513),
    "%%%",
    encode({ version: 2, id, updatedAt }),
    encode({ version: 1, id, updatedAt, owner: id }),
    encode({ version: 1, id: `${id}),id.gt.0`, updatedAt }),
    encode({ version: 1, id, updatedAt: `${updatedAt}),id.gt.0` }),
    encode({ version: 1, id, updatedAt: "2026-02-30T12:00:00Z" }),
    encode({ version: 1, id, updatedAt: "2026-10-22T24:00:00Z" }),
    encode({ version: 1, id, updatedAt: "2026-10-22T12:00:00-04:00" }),
  ])("rejects malformed or injectable cursors: %s", (value) => {
    expect(decodeDraftCursor(value)).toBeNull();
  });
  it.each(["2024-02-29T23:59:59Z", updatedAt, "2026-10-22T12:00:00.1Z"])(
    "accepts UTC precision: %s",
    (value) => {
      expect(isDatabaseTimestamp(value)).toBe(true);
    },
  );
  it("rejects noncanonical encoding and invalid encoder input", () => {
    expect(
      decodeDraftCursor(`${encode({ version: 1, id, updatedAt })}=`),
    ).toBeNull();
    expect(() => encodeDraftCursor({ id: "invalid", updatedAt })).toThrow(
      "Invalid draft cursor.",
    );
  });
});
