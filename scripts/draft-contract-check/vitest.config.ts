import { defineConfig } from "vitest/config";
export default defineConfig({
  root: new URL("../../", import.meta.url).pathname,
  test: {
    environment: "node",
    include: ["scripts/draft-contract-check/draft-contract-check.test.ts"],
    testTimeout: 30000,
  },
});
