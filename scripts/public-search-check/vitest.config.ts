import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": new URL(
        "../../scripts/import-boundaries/server-only-test-stub.ts",
        import.meta.url,
      ).pathname,
      "@": new URL("../../src", import.meta.url).pathname,
    },
  },
  root: new URL("../../", import.meta.url).pathname,
  test: {
    environment: "node",
    include: ["scripts/public-search-check/public-rpc-contract.test.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    fileParallelism: false,
  },
});
