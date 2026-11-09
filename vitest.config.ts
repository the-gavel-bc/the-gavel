import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": new URL(
        "./scripts/import-boundaries/server-only-test-stub.ts",
        import.meta.url,
      ).pathname,
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      "scripts/draft-contract-check/**",
      "scripts/draft-concurrency/**",
      "scripts/draft-editor-check/**",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
