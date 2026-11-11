// Reproduces a reviewed failure with local mocks; no external service is contacted.
// A successful exit confirms the documented failure, not that the application is fixed.
const { resolve } = require("node:path");
const repoRoot = resolve(__dirname, "../../..");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const vm = require("node:vm");
const req = createRequire(resolve(repoRoot, "package.json"));
const ts = req("typescript");
const src = execFileSync(
  "git",
  [
    "show",
    "7b9fed1dbb257dd87e6888251947361dddb615e3:src/backend/media/retired-media-cleanup/retired-media-cleanup.ts",
  ],
  { cwd: repoRoot, encoding: "utf8" },
);
const js = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
let now = 0,
  prefixCalls = 0,
  keyCalls = 0;
const id = "85000000-0000-4000-8000-000000000001";
const client = {
  rpc: async (name, args) => {
    if (name === "start_media_cleanup_run") return { data: id, error: null };
    if (name === "get_media_cleanup_probe")
      return {
        data: [{ object_key: "probe/probe.webp", armed: true }],
        error: null,
      };
    if (name === "claim_retired_article_prefixes") {
      prefixCalls++;
      return {
        data: [{ article_id: id, scan_offset: 0, claim_token: id }],
        error: null,
      };
    }
    if (name === "claim_media_cleanup") {
      keyCalls++;
      return {
        data: [{ object_key: id + "/" + id + ".webp", claim_token: id }],
        error: null,
      };
    }
    if (name === "get_media_cleanup_backlog")
      return { data: { staleKeys: 1, stalePrefixes: 0 }, error: null };
    return { data: true, error: null };
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      remove: async () => ({ error: null }),
      list: async (path) => {
        if (path !== "probe") now += 41000;
        return { data: [], error: null };
      },
    }),
  },
};
const mod = { exports: {} };
vm.runInNewContext(js, {
  module: mod,
  exports: mod.exports,
  require: (s) =>
    s === "server-only"
      ? {}
      : s === "zod"
        ? req("zod")
        : s.includes("media-admin")
          ? { createTrustedMediaClient: () => client }
          : {
              isDraftUuid: (s) =>
                typeof s === "string" && /^[a-f0-9-]{36}$/.test(s),
            },
  Buffer,
  Date: { now: () => now },
  console: { error: () => {} },
});
(async () => {
  for (let i = 0; i < 2; i++) {
    now = 0;
    const result = await mod.exports.runRetiredMediaCleanup();
    console.log(JSON.stringify({ run: i + 1, result, prefixCalls, keyCalls }));
    if (result.ok || keyCalls !== 0 || prefixCalls !== i + 1)
      throw new Error("Expected prefix scans to starve key claims");
  }
})();
