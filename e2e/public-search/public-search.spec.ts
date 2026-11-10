import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { expectVisibleFocus } from "../support/focus/focus";

// Only the dedicated scratch project may override the normal local test database.
const workdir = process.env.SEARCH_BROWSER_WORKDIR;
if (workdir && workdir !== "/private/tmp/gavel-task18-browser")
  throw new Error("Unexpected search browser project");
const container = workdir
  ? "supabase_db_gavel-task18-browser"
  : "supabase_db_the-gavel";
function sql(statement: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XAtq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
test.describe.configure({ mode: "serial" });
let prefix: string;
let query: string;
let installed = false;
let base: number;
const id = (n: number) =>
  `7f000000-0000-0000-0000-${String(base + n).padStart(12, "0")}`;
test.beforeAll(({}, info) => {
  prefix = `search-${info.project.name}`;
  query = `Search${info.project.name}needle`;
  base = info.project.name === "desktop" ? 1000 : 2000;
  sql(`begin;
    do $$ begin if exists(select 1 from public.sections where slug='${prefix}') then raise exception 'Search fixture collision'; end if; end $$;
    insert into public.sections(id,name,slug) values('${id(101)}','Search section ${info.project.name}','${prefix}');
    insert into public.articles(id,owner_profile_id,section_id,title,slug,excerpt,content,status,published_at,archived_at)
    select ('7f000000-0000-0000-0000-'||lpad((${base}+n)::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000002','${id(101)}',
      '${query} story '||n,'${prefix}-story-'||n,'A public search excerpt.',
      '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Search body text."}]}]}}',
      case n when 14 then 'draft'::public.article_status when 15 then 'archived'::public.article_status when 16 then 'archived'::public.article_status else 'published'::public.article_status end,
      case when n!=14 then '2026-11-10T00:00:00.123456Z'::timestamptz else null end,
      case when n in (15,16) then now() else null end from generate_series(1,16) n;
    delete from private.article_id_registry where article_id='${id(16)}';
    delete from public.articles where id='${id(16)}';commit;`);
  installed = true;
});
test.afterAll(() => {
  if (!installed) return;
  sql(
    `begin;delete from private.article_id_registry where article_id in(select id from public.articles where slug like '${prefix}-story-%');delete from public.articles where slug like '${prefix}-story-%';delete from public.sections where slug='${prefix}';commit;`,
  );
});

test("native GET search works without JavaScript, with bounded pages and query retention", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  const response = await page.goto("/search");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  const main = page.getByRole("main");
  await main.getByRole("searchbox").fill(`  ${query}  `);
  await main.getByRole("button", { name: "Search", exact: true }).click();
  await expect(main.getByRole("article")).toHaveCount(12);
  await expect(main.getByRole("searchbox")).toHaveValue(query);
  const next = main.getByRole("link", { name: "Older articles" });
  await next.focus();
  await expectVisibleFocus(next);
  const cursor = new URL(
    (await next.getAttribute("href"))!,
    page.url(),
  ).searchParams.get("cursor")!;
  await next.click();
  await expect(main.getByRole("article")).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Older articles" })).toHaveCount(
    0,
  );
  await expect(
    main.getByRole("link", { name: "Newest results" }),
  ).toBeVisible();
  await page.goto(`/search?q=changed&cursor=${encodeURIComponent(cursor)}`);
  await expect(main.getByRole("searchbox")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await main.getByRole("searchbox").fill("zznosuchsearchneedle");
  await main.getByRole("searchbox").press("Enter");
  expect(new URL(page.url()).searchParams.has("cursor")).toBe(false);
  await expect(main.getByText(/No stories match/)).toBeVisible();
  await context.close();
});

test("literal hostile-looking queries and duplicate parameters stay safe at mobile width", async ({
  page,
}, info) => {
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 900 });
  const main = page.getByRole("main");
  const literal = "<script>window.searchInjected=true</script>";
  await page.goto(`/search?q=${encodeURIComponent(literal)}`);
  await expect(main.getByRole("searchbox")).toHaveValue(literal);
  expect(await page.evaluate(() => "searchInjected" in window)).toBe(false);
  await page.goto(`/search?q=${query}&q=private`);
  await expect(main.getByRole("searchbox")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("unmatched URLs have no-JavaScript recovery search and a real 404", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  expect((await page.goto(`/unknown-${prefix}`))?.status()).toBe(404);
  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(
    main.getByRole("link", { name: "Home", exact: true }),
  ).toHaveAttribute("href", "/");
  await main.getByRole("searchbox").fill(query);
  await main.getByRole("button", { name: "Search", exact: true }).click();
  await expect(main.getByRole("article")).toHaveCount(12);
  await context.close();
});

test("missing, private, archived and deleted resources retain 404 status and recovery", async ({
  page,
}) => {
  for (const path of [
    `/tags/unknown-${prefix}`,
    `/authors/unknown-${prefix}`,
    `/sections/unknown-${prefix}`,
    `/sections/${prefix}/categories/unknown`,
    ...[14, 15, 16].map((n) => `/articles/${prefix}-story-${n}`),
  ]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      path.startsWith("/articles/") ? "Article not found" : "Archive not found",
    );
    await expect(main.getByRole("searchbox")).toBeVisible();
  }
});

test("resource 404 recovery renders in initial HTML without JavaScript", async ({
  browser,
}, info) => {
  // Owner-approved release blocker, not a relaxed assertion. An upstream fix
  // becomes an unexpected pass, requiring this marker and blocker to be removed.
  // The separate passing test above protects real HTTP status and hydrated UI.
  test.fail(
    true,
    "Next.js #100596: matched-resource 404 HTML is empty; blocks public release",
  );
  const context = await browser.newContext({
    ...info.project.use,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto(`/articles/${prefix}-story-14`);
    await expect(page.getByRole("main").getByRole("searchbox")).toBeVisible();
  } finally {
    await context.close();
  }
});

// Real quota mutation belongs only to the dedicated one-worker scratch run.
// Shared CI projects still run the user journeys above without resetting quota.
if (workdir)
  test("one render spends one ticket and no speculative page read; shared throttle recovers", async ({
    page,
  }) => {
    const initial = sql(
      "select last_value||','||is_called from private.public_search_budget;",
    );
    const currentBase = () =>
      Number(
        sql(
          "select floor(extract(epoch from clock_timestamp())/60)::bigint*128;",
        ),
      );
    const used = () =>
      Number(sql("select last_value from private.public_search_budget;")) % 128;
    try {
      sql(
        `select setval('private.public_search_budget',${currentBase()},true);`,
      );
      await page.goto(`/search?q=${query}`);
      await expect(page.getByRole("main").getByRole("article")).toHaveCount(12);
      await page
        .getByRole("main")
        .getByRole("link", { name: "Older articles" })
        .scrollIntoViewIfNeeded();
      // Give hydrated Link prefetch an opportunity to run before reading the counter.
      await page.waitForTimeout(1200);
      expect(used()).toBe(1);
      sql(
        `select setval('private.public_search_budget',${currentBase() + 120},true);`,
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Search is busy" }),
      ).toBeVisible();
      await expect(page.getByRole("main").getByRole("searchbox")).toHaveValue(
        query,
      );
      sql(
        `select setval('private.public_search_budget',${currentBase()},true);`,
      );
      await page.getByRole("link", { name: "Retry search" }).click();
      await expect(page.getByRole("main").getByRole("article")).toHaveCount(12);
    } finally {
      const [value, called] = initial.split(",");
      sql(`select setval('private.public_search_budget',${value},${called});`);
    }
  });
