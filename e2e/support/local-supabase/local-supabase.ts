import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import {
  assertMatchingDbPort,
  dbContainer,
} from "../db-container/db-container";

let verifiedLocal: Readonly<Record<string, string>> | undefined;

export function localSupabase() {
  if (verifiedLocal) return verifiedLocal;
  const status = JSON.parse(
    execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as Record<string, string>;
  if (
    status.API_URL !== "http://127.0.0.1:54321" ||
    !status.JWT_SECRET ||
    !status.PUBLISHABLE_KEY ||
    !status.SERVICE_ROLE_KEY
  )
    throw new Error(
      "Browser tests require the isolated local Supabase project.",
    );
  if (process.env.GAVEL_DB_CONTAINER !== undefined) {
    const publishedPorts = execFileSync(
      "docker",
      ["port", dbContainer(), "5432/tcp"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    assertMatchingDbPort(status.DB_URL, publishedPorts);
  }
  verifiedLocal = Object.freeze(status);
  return verifiedLocal;
}

export async function setLocalSession(
  context: BrowserContext,
  userNumber: number,
) {
  const status = localSupabase();
  const id = `00000000-0000-0000-0000-${String(userNumber).padStart(12, "0")}`;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: `${status.API_URL}/auth/v1`, sub: id, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600 })}`;
  const token = `${unsigned}.${createHmac("sha256", status.JWT_SECRET).update(unsigned).digest("base64url")}`;
  const session = {
    access_token: token,
    refresh_token: "synthetic-unused-refresh-token",
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user: { id },
  };
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${encode(session)}`,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}
