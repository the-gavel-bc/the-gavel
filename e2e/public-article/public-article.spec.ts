import { dbContainer } from "../support/db-container/db-container";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  localSupabase,
  setLocalSession,
} from "../support/local-supabase/local-supabase";
import { expectVisibleFocus } from "../support/focus/focus";

test.describe.configure({ mode: "serial" });
let prefix: string;
let sectionId: string;
let ids: string[];
let installed = false;
function sql(statement: string) {
  localSupabase();
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer(),
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-XqAt",
      "--single-transaction",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}
test.beforeAll(({}, info) => {
  prefix = `public-article-${info.project.name}`;
  const suffix = info.project.name === "desktop" ? "1" : "2";
  sectionId = `7b000000-0000-0000-0000-00000000000${suffix}`;
  ids = [1, 2, 3, 4, 5].map(
    (n) => `7b000000-0000-0000-0000-0000000000${suffix}${n}`,
  );
  sql(`do $$ begin if exists(select 1 from public.sections where id='${sectionId}') or exists(select 1 from public.articles where slug like '${prefix}-%') then raise exception 'Public article fixture collision'; end if; end $$;
    insert into public.sections(id,name,slug) values('${sectionId}','Public article ${prefix}','${prefix}');
    insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at,archived_at)
    select id::uuid,'10000000-0000-0000-0000-000000000002','${sectionId}',title,'${prefix}-'||suffix,
      case when suffix='unsafe' then null else '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Public body without JavaScript."}]}]}}'::jsonb end,
      status::public.article_status,case when status!='draft' then '2026-11-09T00:00:00Z'::timestamptz else null end,
      case when status='archived' then now() else null end
    from (values ('${ids[0]}','Public article browser story','published','story'),('${ids[1]}','Private draft title','draft','draft'),('${ids[2]}','Private archived title','archived','archived'),('${ids[3]}','Unsafe article title','published','unsafe'),('${ids[4]}','Related public story','published','related')) x(id,title,status,suffix);`);
  installed = true;
});
test.afterAll(() => {
  if (!installed) return;
  const quoted = ids.map((id) => `'${id}'`).join(",");
  sql(
    `delete from private.article_id_registry where article_id in (${quoted}); delete from public.articles where id in (${quoted}); delete from public.sections where id='${sectionId}';`,
  );
});

test("published article is identical for anonymous and signed-in owners and works without JavaScript", async ({
  page,
  context,
  browser,
}) => {
  const response = await page.goto(`/articles/${prefix}-story`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  const article = page.getByRole("article", {
    name: "Public article browser story",
    exact: true,
  });
  await expect(article.getByRole("heading", { level: 1 })).toHaveText(
    "Public article browser story",
  );
  await expect(
    article.getByText("Public body without JavaScript."),
  ).toBeVisible();
  const anonymous = await article.innerText();
  const owner = article.getByRole("link", { name: "Author A" });
  await owner.focus();
  await expectVisibleFocus(owner);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await setLocalSession(context, 2);
  await page.reload();
  await expect(article).toHaveText(anonymous, { useInnerText: true });
  const nojs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
  });
  try {
    const reader = await nojs.newPage();
    expect(
      (
        await reader.goto(new URL(`/articles/${prefix}-story`, page.url()).href)
      )?.status(),
    ).toBe(200);
    await expect(
      reader.getByRole("article", {
        name: "Public article browser story",
        exact: true,
      }),
    ).toHaveText(anonymous, { useInnerText: true });
    expect(
      await reader.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await nojs.close();
  }
});
test("private, archived and missing slugs return real 404 to owners too; unsafe content is unavailable", async ({
  page,
  context,
}) => {
  for (const signedIn of [false, true]) {
    if (signedIn) await setLocalSession(context, 2);
    for (const slug of ["draft", "archived", "missing"]) {
      expect((await page.goto(`/articles/${prefix}-${slug}`))?.status()).toBe(
        404,
      );
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Article not found",
      );
      await expect(page.getByText("Private draft title")).toHaveCount(0);
      await expect(page.getByText("Private archived title")).toHaveCount(0);
    }
  }
  await page.goto(`/articles/${prefix}-unsafe`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Article temporarily unavailable",
  );
  await expect(page.getByText("Unsafe article title")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});
