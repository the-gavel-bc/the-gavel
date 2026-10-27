import { defineConfig } from "vitest/config";
export default defineConfig({
  root: new URL("../../", import.meta.url).pathname,
  test: {
    environment: "jsdom",
    include: ["scripts/draft-editor-check/draft-editor-check.test.ts"],
    testTimeout: 30000,
  },
});
