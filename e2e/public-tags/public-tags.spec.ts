import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  localSupabase,
  setLocalSession,
} from "../support/local-supabase/local-supabase";
import { expectVisibleFocus } from "../support/focus/focus";

test.describe.configure({ mode: "serial" });
let prefix: string;
let project: string;
let id: (n: number) => string;
let installed = false;
function sql(statement: string) {
  localSupabase();
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_the-gavel",
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
  project = info.project.name;
  prefix = `topic-${project}`;
  id = (n) =>
    `7d000000-0000-0000-0000-${String((project === "desktop" ? 1000 : 2000) + n).padStart(12, "0")}`;
  sql(`do $$ begin if exists(select 1 from public.sections where slug like '${prefix}-%') or exists(select 1 from public.tags where slug like '${prefix}-%') or exists(select 1 from public.profiles where id='${id(399)}') then raise exception 'Tag browser fixture collision'; end if; end $$;
    insert into public.sections(id,name,slug,active) values
      ('${id(101)}','Topic News ${project}','${prefix}-news',true),('${id(102)}','Topic Sports ${project}','${prefix}-sports',true),('${id(103)}','Topic Hidden ${project}','${prefix}-hidden',false);
    insert into public.profiles(id,display_name,slug) values('${id(399)}','Legacy Topic Owner ${project}','${prefix}-legacy-owner');
    insert into public.tags(id,name,slug) values('${id(201)}','Topic ${project}','${prefix}-main'),('${id(202)}','Other topic ${project}','${prefix}-other'),('${id(203)}','Empty topic ${project}','${prefix}-empty');
    insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at,archived_at)
    select ('7d000000-0000-0000-0000-'||lpad((${project === "desktop" ? 1000 : 2000}+n)::text,12,'0'))::uuid,
      case when n=17 then '${id(399)}'::uuid else '10000000-0000-0000-0000-000000000002'::uuid end,
      case when n=16 then '${id(103)}'::uuid when n%2=0 then '${id(102)}'::uuid else '${id(101)}'::uuid end,
      '${prefix} story '||n,'${prefix}-story-'||n,
      '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic tagged story body."}]}]}}'::jsonb,
      case n when 14 then 'draft'::public.article_status when 15 then 'archived'::public.article_status else 'published'::public.article_status end,
      case when n!=14 then '2026-11-10T00:00:00Z'::timestamptz+n*interval '1 second' else null end,
      case when n=15 then now() else null end from generate_series(1,18) n;
    insert into public.article_tags(article_id,tag_id) select id,'${id(201)}' from public.articles where slug like '${prefix}-story-%' and slug!='${prefix}-story-18';
    insert into public.article_tags(article_id,tag_id) values('${id(1)}','${id(202)}'),('${id(18)}','${id(202)}');
    insert into public.article_contributors(article_id,profile_id,contribution_role) values
      ('${id(1)}','10000000-0000-0000-0000-000000000002','writer'),('${id(1)}','10000000-0000-0000-0000-000000000002','editor'),('${id(1)}','10000000-0000-0000-0000-000000000003','writer');
    -- Privileged fixture models stale legacy references after valid publication.
    update public.profiles set active=false where id='${id(399)}';`);
  installed = true;
});
test.afterAll(() => {
  if (!installed) return;
  sql(`delete from public.article_tags where tag_id in ('${id(201)}','${id(202)}','${id(203)}');
    delete from public.article_contributors where article_id='${id(1)}';
    delete from private.article_id_registry where article_id in (select id from public.articles where slug like '${prefix}-story-%');
    delete from public.articles where slug like '${prefix}-story-%';
    delete from public.tags where slug like '${prefix}-%';delete from public.sections where slug like '${prefix}-%';delete from public.profiles where id='${id(399)}';`);
});

test("article topic links lead to multi-section archives with native isolated pagination", async ({
  page,
}) => {
  if (project === "mobile")
    await page.setViewportSize({ width: 320, height: 900 });
  const main = page.getByRole("main");
  await page.goto(`/articles/${prefix}-story-1`);
  await main
    .getByRole("navigation", { name: "Article topics" })
    .getByRole("link", { name: `Topic ${project}`, exact: true })
    .click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    `Topic ${project}`,
  );
  await expect(main.getByRole("article")).toHaveCount(12);
  await expect(
    main.getByRole("navigation", { name: "Categories" }),
  ).toHaveCount(0);
  for (const section of ["News", "Sports"])
    await expect(
      main
        .getByRole("link", { name: `Topic ${section} ${project}`, exact: true })
        .first(),
    ).toHaveAttribute("href", `/sections/${prefix}-${section.toLowerCase()}`);
  const older = main.getByRole("link", { name: "Older articles" });
  await older.focus();
  await expectVisibleFocus(older);
  const cursor = new URL(
    (await older.getAttribute("href"))!,
    page.url(),
  ).searchParams.get("cursor")!;
  await older.click();
  await expect(main.getByRole("article")).toHaveCount(1);
  await expect(
    main.getByRole("link", { name: `${prefix} story 1`, exact: true }),
  ).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Older articles" })).toHaveCount(
    0,
  );
  await page.goto(`/tags/${prefix}-other?cursor=${encodeURIComponent(cursor)}`);
  await expect(
    main.getByText("This article page is invalid or expired."),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(
    main.getByRole("link", { name: "Newest articles" }),
  ).toHaveAttribute("href", `/tags/${prefix}-other`);
  await main.getByRole("link", { name: "Newest articles" }).click();
  await expect(main.getByRole("article")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("tags hide private and stale references, distinguish empty404, and work without JavaScript", async ({
  page,
  context,
  browser,
}) => {
  const main = page.getByRole("main");
  await setLocalSession(context, 2);
  const response = await page.goto(`/tags/${prefix}-main`);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(main.getByRole("article")).toHaveCount(12);
  for (const n of [14, 15, 16, 17, 18])
    await expect(
      main.getByText(`${prefix} story ${n}`, { exact: true }),
    ).toHaveCount(0);
  expect((await page.goto(`/tags/${prefix}-missing`))?.status()).toBe(404);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    "Archive not found",
  );
  await page.goto(`/tags/${prefix}-empty`);
  await expect(main.getByText("No articles yet")).toBeVisible();
  await page.goto(`/tags/${prefix}-main?cursor=one&cursor=two`);
  await expect(
    main.getByText("This article page is invalid or expired."),
  ).toBeVisible();
  const nojs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
  });
  try {
    const reader = await nojs.newPage();
    const content = reader.getByRole("main");
    await reader.goto(new URL(`/articles/${prefix}-story-1`, page.url()).href);
    await content
      .getByRole("navigation", { name: "Article topics" })
      .getByRole("link", { name: `Topic ${project}`, exact: true })
      .click();
    await expect(content.getByRole("article")).toHaveCount(12);
    expect(
      await reader.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await content.getByRole("link", { name: "Older articles" }).click();
    await expect(content.getByRole("article")).toHaveCount(1);
    await content
      .getByRole("link", { name: `${prefix} story 1`, exact: true })
      .click();
    await expect(
      content.getByText("Synthetic tagged story body."),
    ).toBeVisible();
  } finally {
    await nojs.close();
  }
});
