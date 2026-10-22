import { defineConfig } from "vitest/config";
export default defineConfig({
  root: new URL("../../", import.meta.url).pathname,
  test: {
    environment: "node",
    include: ["scripts/draft-concurrency/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
