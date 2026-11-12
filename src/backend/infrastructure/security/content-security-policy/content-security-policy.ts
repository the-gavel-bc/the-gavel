import "server-only";

// One policy for every HTML document. Next.js reads the nonce from the request's
// Content-Security-Policy header and applies it to its own scripts and styles.
export function contentSecurityPolicy({
  nonce,
  supabaseUrl,
  siteUrl,
  development,
}: {
  nonce: string;
  supabaseUrl: string;
  siteUrl: string;
  development: boolean;
}): string {
  // A native (no-JavaScript) sign-in form post redirects to Supabase and then
  // Google; browsers apply form-action to that whole redirect chain.
  const formTargets = [
    "'self'",
    new URL(supabaseUrl).origin,
    "https://accounts.google.com",
  ];
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The browser never calls Supabase directly; all data flows through this origin.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${formTargets.join(" ")}`,
    "frame-ancestors 'none'",
    // Local development uses plain HTTP Supabase; upgrading would break it.
    ...(new URL(siteUrl).protocol === "https:"
      ? ["upgrade-insecure-requests"]
      : []),
  ];
  return directives.join("; ");
}

export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64",
  );
}
