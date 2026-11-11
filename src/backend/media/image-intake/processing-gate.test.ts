import { expect, it } from "vitest";
import { createImageProcessingGate } from "./processing-gate";
it("bounds active jobs without queuing and releases permits exactly once", () => {
  const acquire = createImageProcessingGate();
  const first = acquire()!;
  const second = acquire()!;
  expect(acquire()).toBeNull();
  first();
  first();
  const third = acquire()!;
  expect(third).toBeTypeOf("function");
  expect(acquire()).toBeNull();
  second();
  third();
  expect(acquire()).toBeTypeOf("function");
});
