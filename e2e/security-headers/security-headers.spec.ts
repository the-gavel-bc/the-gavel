import { expect, test, type Page } from "@playwright/test";
import {
  localSupabase,
  setLocalSession,
} from "../support/local-supabase/local-supabase";

// Record CSP violations from both the DOM event and the console.
async function watch(page: Page) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text()))
      violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const store = window as unknown as { __csp?: string[] };
      store.__csp = [...(store.__csp ?? []), event.violatedDirective];
    });
  });
  return async () => [
    ...violations,
    ...(await page.evaluate(
      () => (window as unknown as { __csp?: string[] }).__csp ?? [],
    )),
  ];
}

async function visit(page: Page, path: string, status = 200) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(status);
  const headers = response!.headers();
  const policy = headers["content-security-policy"] ?? "";
  expect(policy, `${path} CSP`).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(policy).toContain("frame-ancestors 'none'");
  const nonce = policy.match(/'nonce-([^']+)'/)![1];
  // Server-rendered scripts carry this request's nonce; chunks the router adds
  // later via createElement are trusted through 'strict-dynamic'.
  const tags = (await response!.text()).match(/<script\b[^>]*>/g) ?? [];
  expect(tags.length, `${path} scripts`).toBeGreaterThan(0);
  for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  await page.waitForLoadState("networkidle");
  return nonce;
}

test("public documents get a fresh nonce policy and run without violations", async ({
  page,
}) => {
  const violations = await watch(page);
  const nonces = new Set<string>();
  for (const [path, status] of [
    ["/", 200],
    ["/search?q=policy", 200],
    ["/about", 200],
    ["/sign-in", 200],
    ["/articles/missing-security-story", 404],
    ["/no-such-security-page", 404],
  ] as const)
    nonces.add(await visit(page, path, status));
  expect(nonces.size).toBe(6);
  expect(await violations()).toEqual([]);
});

test("the dashboard editor works under the policy", async ({
  page,
  context,
}) => {
  await setLocalSession(context, 4);
  const violations = await watch(page);
  await visit(page, "/dashboard");
  await visit(page, "/dashboard/articles/new");
  const body = page.locator("#draft-content");
  await expect(body).toBeVisible();
  await body.click();
  await page.keyboard.type("Typed under CSP.");
  await expect(body).toContainText("Typed under CSP.");
  // Tiptap's base CSS comes from the CSS module, not an injected <style>.
  expect(
    await body.evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toMatch(/pre-wrap|break-spaces/);
  expect(await violations()).toEqual([]);
});

test("injected inline event handlers do not run", async ({ page }) => {
  const violations = await watch(page);
  await visit(page, "/");
  await page.evaluate(() => {
    const holder = document.createElement("div");
    holder.innerHTML = '<img src="data:," onload="window.__injected = true">';
    document.body.append(holder);
  });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => (window as unknown as { __injected?: boolean }).__injected === true,
    ),
  ).toBe(false);
  expect((await violations()).join("\n")).toMatch(/script-src/);
});

test("sign-in without JavaScript can still redirect to Supabase", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const authorize = page.waitForRequest((request) =>
    request.url().startsWith(`${localSupabase().API_URL}/auth/v1/authorize`),
  );
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /google/i }).click();
  expect((await authorize).url()).toContain("provider=google");
  await context.close();
});
