// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import {
  prepareDatabasePort,
  replaceDatabasePort,
} from "./prepare-database-port.mjs";

const config = `[api]\nport = 54321\n\n[db]\nport = 54322 # developer default\nshadow_port = 54320\n\n[studio]\nport = 54323\n`;
const directories = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "gavel-ci-port-"));
  directories.push(directory);
  const path = join(directory, "config.toml");
  await writeFile(path, config);
  return path;
}
it("changes only the database host port and preserves comments and other services", () => {
  expect(replaceDatabasePort(config, 15422)).toBe(
    config.replace("port = 54322", "port = 15422"),
  );
});
it("preserves CRLF configuration", () => {
  const windows = config.replaceAll("\n", "\r\n");
  expect(replaceDatabasePort(windows, 15422)).toBe(
    windows.replace("port = 54322", "port = 15422"),
  );
});
it.each([
  config.replace("[db]", "[other]"),
  config.replace("port = 54322", "port = invalid"),
  config.replace("shadow_port", "port"),
])("fails closed on missing or ambiguous database configuration", (value) => {
  expect(() => replaceDatabasePort(value, 15422)).toThrow();
});
it("skips occupied ports and writes the first available port", async () => {
  const configPath = await fixture();
  const checked = [];
  const port = await prepareDatabasePort({
    configPath,
    candidates: [15422, 15423],
    available: async (value) => {
      checked.push(value);
      return value === 15423;
    },
  });
  expect(port).toBe(15423);
  expect(checked).toEqual([15422, 15423]);
  expect(await readFile(configPath, "utf8")).toBe(
    config.replace("port = 54322", "port = 15423"),
  );
});
it("leaves config untouched if every candidate is occupied", async () => {
  const configPath = await fixture();
  await expect(
    prepareDatabasePort({
      configPath,
      candidates: [15422, 15423],
      available: async () => false,
    }),
  ).rejects.toThrow("No available CI database port");
  expect(await readFile(configPath, "utf8")).toBe(config);
});
it("refuses to run the CLI outside CI", async () => {
  const configPath = await fixture();
  const directory = join(configPath, "..");
  await mkdir(join(directory, "supabase"));
  const target = join(directory, "supabase", "config.toml");
  await writeFile(target, config);
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./prepare-database-port.mjs", import.meta.url))],
    { cwd: directory, env: { CI: "" }, encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("CI only");
  expect(await readFile(target, "utf8")).toBe(config);
});

it("rejects invalid candidates without writing configuration", async () => {
  const configPath = await fixture();
  await expect(
    prepareDatabasePort({
      configPath,
      candidates: [0],
      available: async () => true,
    }),
  ).rejects.toThrow("Invalid CI database port");
  expect(await readFile(configPath, "utf8")).toBe(config);
});
