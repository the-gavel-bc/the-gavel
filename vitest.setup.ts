import "@testing-library/jest-dom/vitest";
import { act, cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest globals are disabled, so Testing Library cannot auto-register cleanup.
// Flush pending React work before jsdom tears down the window.
afterEach(async () => {
  await act(async () => {
    cleanup();
  });
});

// next/font is a build-time transform; give tests its runtime shape.
vi.mock("next/font/local", () => ({
  default: () => ({ className: "font", variable: "font-variable" }),
}));
