import { expect, test } from "@playwright/test";
import { createFixture, scratch, sql } from "./metadata-fixture";
test.describe.configure({ mode: "serial" });
let fixture: Awaited<ReturnType<typeof createFixture>>;
test.beforeAll(async ({}, info) => {
  fixture = await createFixture(info.project.name);
});
test.afterAll(async () => {
  if (fixture) await fixture.cleanup();
});
const origin = "http://127.0.0.1:3100";

test("public canonical/social tags live in initial head and use stored identity", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    const path = `/articles/${fixture.prefix}-story-1`;
    const response = await page.goto(path + "?utm_source=untrusted");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      "href",
      origin + path,
    );
    await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute(
      "content",
      origin + path,
    );
    await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
      "content",
      "article",
    );
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      "content",
      'Description with "quotes" & literal text.',
    );
    const image = `${origin}/api/public/articles/${fixture.id(1)}/media/${fixture.id(201)}`;
    await expect(
      page.locator('head meta[property="og:image"]'),
    ).toHaveAttribute("content", image);
    expect((await context.request.get(image)).status()).toBe(200);
    await page.goto(`/articles/${fixture.prefix}-story-2`);
    await expect(page.locator('head meta[property="og:image"]')).toHaveCount(0);
    await expect(
      page.locator('head meta[name="twitter:card"]'),
    ).toHaveAttribute("content", "summary");
    const forged = await context.request.get(path, {
      headers: {
        host: "evil.test",
        "x-forwarded-host": "evil.test",
        "x-forwarded-proto": "https",
      },
    });
    expect(await forged.text()).toContain(
      `rel="canonical" href="${origin}${path}"`,
    );
    for (const route of [
      `/sections/${fixture.prefix}`,
      `/sections/${fixture.prefix}/categories/campus`,
      `/tags/${fixture.prefix}-topic`,
      `/authors/${fixture.prefix}-writer`,
    ]) {
      await page.goto(route);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        "href",
        origin + route,
      );
    }
    await page.goto(`/sections/${fixture.prefix}`);
    const older = page
      .getByRole("main")
      .getByRole("link", { name: "Load more articles" });
    await older.click();
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("private/auth/search and malformed variants cannot advertise private metadata", async ({
  page,
  context,
}) => {
  await fixture.signIn(context);
  // Confirm the synthetic cookie represents an eligible current owner, not an
  // invalid cookie that would make anonymous/signed-in parity vacuous.
  expect((await context.request.get("/dashboard")).status()).toBe(200);
  for (const n of [3, 4]) {
    const r = await page.goto(`/articles/${fixture.prefix}-story-${n}`);
    expect(r?.status()).toBe(404);
    expect(await page.content()).not.toMatch(
      /PRIVATE DRAFT SECRET|PRIVATE ARCHIVE SECRET/,
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
  await page.goto(`/articles/${fixture.prefix}-story-5`);
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
  await page.goto(`/sections/${fixture.prefix}?cursor=malformed`);
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
  for (const path of [
    "/search",
    "/dashboard",
    "/api/articles/not-an-id/media/not-an-id",
    "/api/internal/media-cleanup",
  ]) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
  await context.clearCookies();
  for (const path of [
    "/sign-in",
    "/access-pending",
    "/auth/callback?error=denied",
  ]) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
});

test("fresh metadata follows published edits/archive/restore/delete and signed-in parity", async ({
  page,
  context,
}) => {
  const path = `/articles/${fixture.prefix}-story-1`;
  await page.goto(path);
  const anonymous = await page.locator("head").innerHTML();
  await fixture.signIn(context);
  await page.reload();
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
    "href",
    origin + path,
  );
  await expect(page.locator('head meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Metadata title 1 | The Gavel",
  );
  expect(anonymous).toContain("Metadata title 1 | The Gavel");
  const target = fixture.id(2);
  {
    sql(
      `update public.articles set title='Edited public headline' where id='${target}';`,
    );
    await page.goto(`/articles/${fixture.prefix}-story-2`);
    await expect(
      page.locator('head meta[property="og:title"]'),
    ).toHaveAttribute("content", "Edited public headline | The Gavel");
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/articles/${fixture.prefix}-story-2`,
    );
    sql(
      `update public.articles set status='archived',archived_at=now() where id='${target}';`,
    );
    expect((await page.reload())?.status()).toBe(404);
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
    sql(
      `update public.articles set status='published',archived_at=null where id='${target}';`,
    );
    expect((await page.reload())?.status()).toBe(200);
    await expect(
      page.locator('head meta[property="og:title"]'),
    ).toHaveAttribute("content", "Edited public headline | The Gavel");
    sql(
      `delete from private.article_id_registry where article_id='${target}';delete from public.articles where id='${target}';`,
    );
    expect((await page.reload())?.status()).toBe(404);
    await expect(page.locator('head meta[property="og:title"]')).toHaveCount(0);
  }
});

if (scratch)
  test("metadata and page share exactly one published-article RPC", async ({
    browser,
  }, info) => {
    // Match the exact RPC: article media has a separate authorized request.
    const count = () =>
      Number(
        sql(
          'select coalesce(sum(calls),0) from extensions.pg_stat_statements where query like \'%"public"."get_public_article"(%\';',
        ),
      );
    const context = await browser.newContext({
      ...info.project.use,
      javaScriptEnabled: false,
    });
    try {
      const before = count();
      const page = await context.newPage();
      await page.goto(`/articles/${fixture.prefix}-story-1`);
      expect(count() - before).toBe(1);
    } finally {
      await context.close();
    }
  });
