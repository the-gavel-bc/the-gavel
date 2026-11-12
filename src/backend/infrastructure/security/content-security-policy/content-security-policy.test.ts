import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, createNonce } from "./content-security-policy";

const base = {
  nonce: "abc123==",
  supabaseUrl: "https://project.supabase.co/rest",
  siteUrl: "https://gavel.example",
  development: false,
};
const directives = (policy: string) =>
  Object.fromEntries(
    policy.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values];
    }),
  );

describe("content security policy", () => {
  it("allows only nonce-bearing scripts and styles in production", () => {
    const policy = directives(contentSecurityPolicy(base));
    expect(policy["script-src"]).toEqual([
      "'self'",
      "'nonce-abc123=='",
      "'strict-dynamic'",
    ]);
    expect(policy["style-src"]).toEqual(["'self'", "'nonce-abc123=='"]);
    expect(JSON.stringify(policy)).not.toMatch(/unsafe-(inline|eval)/);
  });
  it("blocks framing, plugins, base rewriting and foreign connections", () => {
    const policy = directives(contentSecurityPolicy(base));
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["connect-src"]).toEqual(["'self'"]);
    expect(policy["default-src"]).toEqual(["'self'"]);
    expect(policy["img-src"]).toEqual(["'self'", "blob:", "data:"]);
  });
  it("lets the sign-in form redirect only to Supabase's origin and Google", () => {
    expect(directives(contentSecurityPolicy(base))["form-action"]).toEqual([
      "'self'",
      "https://project.supabase.co",
      "https://accounts.google.com",
    ]);
  });
  it("upgrades insecure requests only for an HTTPS site", () => {
    expect(contentSecurityPolicy(base)).toContain("upgrade-insecure-requests");
    expect(
      contentSecurityPolicy({ ...base, siteUrl: "http://localhost:3000" }),
    ).not.toContain("upgrade-insecure-requests");
  });
  it("relaxes only what React and the dev overlay need in development", () => {
    const policy = directives(
      contentSecurityPolicy({ ...base, development: true }),
    );
    expect(policy["script-src"]).toContain("'unsafe-eval'");
    expect(policy["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
  });
  it("creates a fresh unguessable nonce each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
