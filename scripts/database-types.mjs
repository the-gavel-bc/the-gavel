import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";

const target = "src/lib/supabase/database.types.ts";
const result = spawnSync(
  "pnpm",
  ["exec", "supabase", "gen", "types", "--lang", "typescript", "--local"],
  {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (result.error || result.status !== 0) {
  console.error(
    "Database type generation failed. Ensure local Supabase is running.",
  );
  process.exit(1);
}
const generated = await format(result.stdout, {
  ...(await resolveConfig(target)),
  filepath: target,
});
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== generated) {
    console.error("Database types differ. Regenerate with pnpm db:types.");
    process.exit(1);
  }
  console.log("Database types match the local schema.");
} else {
  process.stdout.write(generated);
}
