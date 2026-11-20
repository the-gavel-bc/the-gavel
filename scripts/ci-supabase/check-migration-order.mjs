import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const migrationDirectory = "supabase/migrations/";

function versions(files) {
  const byVersion = new Map();
  for (const file of files) {
    const version = /^(\d{14})_[^/]+\.sql$/.exec(file)?.[1];
    if (!version) throw new Error(`Invalid migration filename: ${file}`);
    if (byVersion.has(version))
      throw new Error(
        `Duplicate migration version ${version}: ${byVersion.get(version)} and ${file}`,
      );
    byVersion.set(version, file);
  }
  return byVersion;
}

export function checkMigrationOrder(baseFiles, headFiles) {
  const base = versions(baseFiles);
  const head = versions(headFiles);
  for (const [version, file] of base)
    if (head.get(version) !== file)
      throw new Error(`Missing base migration: ${file}`);

  const latest = [...base.keys()].sort().at(-1);
  for (const [version, file] of head) {
    if (!base.has(version) && latest && version <= latest)
      throw new Error(`New migration ${file} must be newer than ${latest}`);
  }
}

function migrationFiles(revision) {
  const tree = execFileSync(
    "git",
    ["rev-parse", "--verify", "--end-of-options", `${revision}^{tree}`],
    {
      encoding: "utf8",
    },
  ).trim();
  return execFileSync(
    "git",
    ["ls-tree", "-rz", "--name-only", tree, "--", migrationDirectory],
    {
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter((path) => path.endsWith(".sql"))
    .map((path) => path.slice(migrationDirectory.length));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [base, head] = process.argv.slice(2);
    if (!base || !head)
      throw new Error("Usage: check-migration-order.mjs <base> <head>");
    checkMigrationOrder(migrationFiles(base), migrationFiles(head));
    console.log("Migration order verified.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
