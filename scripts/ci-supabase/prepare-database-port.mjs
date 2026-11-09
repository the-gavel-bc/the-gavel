import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function replaceDatabasePort(config, port) {
  const section = /^\[db\][ \t]*\r?\n/m.exec(config);
  if (!section) throw new Error("Missing Supabase [db] section.");
  const start = section.index + section[0].length;
  const following = config.slice(start);
  const next = following.search(/^\[/m);
  const end = next === -1 ? config.length : start + next;
  const database = config.slice(start, end);
  const ports = [
    ...database.matchAll(/^port[ \t]*=[ \t]*\d+[ \t]*(?:#[^\r\n]*)?\r?$/gm),
  ];
  if (ports.length !== 1)
    throw new Error("Expected one numeric Supabase database port.");
  const updated = database.replace(
    /^(port[ \t]*=[ \t]*)\d+/m,
    (_, prefix) => `${prefix}${port}`,
  );
  return config.slice(0, start) + updated + config.slice(end);
}

export function portAvailable(port) {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") accept(false);
      else reject(error);
    });
    // Match Docker's wildcard binding rather than checking loopback alone.
    server.listen({ host: "0.0.0.0", port }, () => {
      server.close((error) => (error ? reject(error) : accept(true)));
    });
  });
}

export async function prepareDatabasePort({
  configPath = "supabase/config.toml",
  candidates = Array.from({ length: 10 }, (_, index) => 15422 + index),
  available = portAvailable,
} = {}) {
  const config = await readFile(configPath, "utf8");
  for (const port of candidates) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("Invalid CI database port candidate.");
    if (await available(port)) {
      // Change the disposable runner's config so start/reset/type generation agree.
      await writeFile(configPath, replaceDatabasePort(config, port));
      return port;
    }
  }
  throw new Error("No available CI database port in the candidate range.");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.CI !== "true")
      throw new Error(
        "CI only: refusing to change local Supabase configuration.",
      );
    console.log(
      `Selected CI Supabase database port ${await prepareDatabasePort()}.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "CI database port preparation failed.",
    );
    process.exitCode = 1;
  }
}
