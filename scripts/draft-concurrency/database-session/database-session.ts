import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// Test-only local psql transport. Never accepts a hosted URL or credentials.
export class DatabaseSession {
  readonly applicationName = `gavel-draft-test-${randomUUID()}`;
  private child = spawn("docker", [
    "exec",
    "-i",
    process.env.GAVEL_DB_CONTAINER ?? "supabase_db_the-gavel",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-XAtq",
    "-v",
    "ON_ERROR_STOP=1",
  ]);
  private buffer = "";
  private pending?: {
    marker: string;
    lines: string[];
    resolve: (lines: string[]) => void;
    reject: (error: Error) => void;
  };
  constructor() {
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline).replace(/\r$/u, "");
        this.buffer = this.buffer.slice(newline + 1);
        if (line === this.pending?.marker) {
          const pending = this.pending;
          this.pending = undefined;
          pending.resolve(pending.lines);
        } else if (this.pending && line) this.pending.lines.push(line);
      }
    });
    // Drain diagnostics without exposing SQL or draft payloads in test output.
    this.child.stderr.on("data", () => {});
    const fail = () => {
      this.pending?.reject(
        new Error("Local database session failed; SQL diagnostics withheld."),
      );
      this.pending = undefined;
    };
    this.child.on("error", fail);
    this.child.on("exit", fail);
  }
  async ready(): Promise<void> {
    await this.execute(
      `set application_name='${this.applicationName}'; set statement_timeout='8s'; set lock_timeout='6s';`,
    );
  }
  execute(sql: string): Promise<string[]> {
    if (this.pending)
      throw new Error("Only one command may be pending per database session.");
    if (this.child.exitCode !== null)
      throw new Error("Database session already ended.");
    return new Promise((resolve, reject) => {
      const marker = `gavel-result-${randomUUID()}`;
      const timer = setTimeout(() => {
        this.pending = undefined;
        this.child.kill();
        reject(new Error("Local database session timed out."));
      }, 12000);
      this.pending = {
        marker,
        lines: [],
        resolve: (lines) => {
          clearTimeout(timer);
          resolve(lines);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.child.stdin.write(`${sql}\nselect '${marker}';\n`);
    });
  }
  async json<T>(expression: string): Promise<T> {
    const lines = await this.execute(`select (${expression})::text;`);
    if (lines.length !== 1) throw new Error("Expected one database result.");
    return JSON.parse(lines[0]) as T;
  }
  async close(): Promise<void> {
    if (this.child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill();
        resolve();
      }, 3000);
      this.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      this.child.stdin.end("rollback;\n\\q\n");
    });
  }
}
export function fixtureJson(value: unknown): string {
  return `convert_from(decode('${Buffer.from(JSON.stringify(value), "utf8").toString("hex")}','hex'),'UTF8')::jsonb`;
}
export async function waitForLock(
  observer: DatabaseSession,
  blocked: DatabaseSession,
): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (
      await observer.json<boolean>(
        `exists(select 1 from pg_stat_activity where application_name='${blocked.applicationName}' and wait_event_type='Lock')`,
      )
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    "Expected a real database lock wait before releasing the competing transaction.",
  );
}
