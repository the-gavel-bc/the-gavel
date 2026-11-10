import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  localSupabase,
  setLocalSession,
} from "../support/local-supabase/local-supabase";
import { expectVisibleFocus } from "../support/focus/focus";

test.describe.configure({ mode: "serial" });
let project: string;
let prefix: string;
let news: string;
let sports: string;
let installed = false;
let id: (n: number) => string;
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
  prefix = `archive-${project}`;
  news = `${prefix}-news`;
  sports = `${prefix}-sports`;
  id = (n) =>
    `7c000000-0000-0000-0000-${String((project === "desktop" ? 1000 : 2000) + n).padStart(12, "0")}`;
  sql(`do $$ begin if exists(select 1 from public.sections where slug like '${prefix}-%')
    ${project === "desktop" ? "or exists(select 1 from public.sections where lower(name)='letter to the editor')" : ""}
    then raise exception 'Archive fixture collision; refusing to replace existing taxonomy'; end if; end $$;
    insert into public.sections(id,name,slug,active) values
      ('${id(101)}','Archive News ${project}','${news}',true),
      ('${id(102)}','Archive Sports ${project}','${sports}',true),
      ('${id(103)}','Archive Empty ${project}','${prefix}-empty',true),
      ('${id(104)}','Archive Hidden ${project}','${prefix}-hidden',false)
      ${project === "desktop" ? `,('${id(105)}','Letter to the Editor','${prefix}-configured-letters',true)` : ""};
    insert into public.categories(id,section_id,name,slug,active) values
      ('${id(201)}','${id(101)}','Campus news ${project}','campus',true),
      ('${id(202)}','${id(102)}','Campus sports ${project}','campus',true),
      ('${id(203)}','${id(101)}','Hidden category ${project}','hidden',false),
      ('${id(204)}','${id(104)}','Hidden parent category ${project}','campus',true),
      ('${id(205)}','${id(101)}','Empty category ${project}','empty',true);
    insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at,archived_at)
    select ('7c000000-0000-0000-0000-'||lpad((${project === "desktop" ? 1000 : 2000}+n)::text,12,'0'))::uuid,
      '10000000-0000-0000-0000-000000000002',case when n=14 then '${id(102)}'::uuid when n=17 then '${id(105)}'::uuid else '${id(101)}'::uuid end,
      '${prefix} story '||n,'${prefix}-story-'||n,
      '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic archive article body."}]}]}}'::jsonb,
      case n when 15 then 'draft'::public.article_status when 16 then 'archived'::public.article_status else 'published'::public.article_status end,
      case when n!=15 then '2026-11-10T00:00:00Z'::timestamptz+n*interval '1 second' else null end,
      case when n=16 then now() else null end from generate_series(1,${project === "desktop" ? 17 : 16}) n;
    insert into public.article_categories(article_id,section_id,category_id)
      select id,section_id,case when slug='${prefix}-story-14' then '${id(202)}'::uuid else '${id(201)}'::uuid end from public.articles where slug like '${prefix}-story-%' and section_id in ('${id(101)}','${id(102)}');`);
  installed = true;
});
test.afterAll(() => {
  if (!installed) return;
  sql(`delete from public.article_categories where section_id in ('${id(101)}','${id(102)}');
    delete from private.article_id_registry where article_id in (select id from public.articles where slug like '${prefix}-story-%');
    delete from public.articles where slug like '${prefix}-story-%';
    delete from public.categories where section_id in (select id from public.sections where slug like '${prefix}-%');
    delete from public.sections where slug like '${prefix}-%';`);
});

test("archives paginate natively and bind equal category slugs to the selected section", async ({
  page,
}) => {
  const main = page.getByRole("main");
  if (project === "mobile")
    await page.setViewportSize({ width: 320, height: 900 });
  expect((await page.goto(`/sections/${news}`))?.status()).toBe(200);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    `Archive News ${project}`,
  );
  await expect(main.getByRole("article")).toHaveCount(12);
  await expect(
    main.getByRole("link", { name: `${prefix} story 13`, exact: true }),
  ).toHaveCount(1);
  const chip = main
    .getByRole("navigation", { name: "Categories" })
    .getByRole("link", { name: `Campus news ${project}` });
  await chip.focus();
  await expectVisibleFocus(chip);
  await chip.click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    `Campus news ${project}`,
  );
  const older = main.getByRole("link", { name: "Older articles" });
  const cursor = new URL(
    (await older.getAttribute("href"))!,
    page.url(),
  ).searchParams.get("cursor")!;
  await older.click();
  await expect(main.getByRole("article")).toHaveCount(1);
  await expect(main.getByRole("link", { name: "Older articles" })).toHaveCount(
    0,
  );
  await expect(
    main.getByRole("link", { name: `${prefix} story 1`, exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "Newest articles" }).click();
  await expect(main.getByRole("article")).toHaveCount(12);
  await page.goto(
    `/sections/${sports}/categories/campus?cursor=${encodeURIComponent(cursor)}`,
  );
  await expect(
    main.getByText("This article page is invalid or expired."),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Newest articles" }),
  ).toHaveAttribute("href", `/sections/${sports}/categories/campus`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await main.getByRole("link", { name: "Newest articles" }).click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    `Campus sports ${project}`,
  );
  await expect(main.getByRole("article")).toHaveCount(1);
  await expect(
    main.getByRole("link", { name: `${prefix} story 14`, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("archives enforce public visibility, real scope404, empty/recovery states and no-JavaScript access", async ({
  page,
  context,
  browser,
}) => {
  const main = page.getByRole("main");
  await setLocalSession(context, 2);
  await page.goto(`/sections/${news}`);
  await expect(main.getByRole("article")).toHaveCount(12);
  for (const n of [15, 16])
    await expect(
      main.getByText(`${prefix} story ${n}`, { exact: true }),
    ).toHaveCount(0);
  for (const path of [
    `${prefix}-missing`,
    `${prefix}-hidden`,
    `${news}/categories/hidden`,
    `${prefix}-hidden/categories/campus`,
    `${news}/categories/missing`,
  ]) {
    expect((await page.goto(`/sections/${path}`))?.status()).toBe(404);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "Archive not found",
    );
  }
  for (const path of [`${prefix}-empty`, `${news}/categories/empty`]) {
    await page.goto(`/sections/${path}`);
    await expect(main.getByText("No articles yet")).toBeVisible();
  }
  await page.goto(`/sections/${news}?cursor=one&cursor=two`);
  await expect(
    main.getByText("This article page is invalid or expired."),
  ).toBeVisible();
  const nojs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
  });
  try {
    const reader = await nojs.newPage();
    const response = await reader.goto(
      new URL(`/sections/${news}/categories/campus`, page.url()).href,
    );
    expect(response?.headers()["cache-control"]).toContain("no-store");
    const content = reader.getByRole("main");
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
      content.getByText("Synthetic archive article body."),
    ).toBeVisible();
  } finally {
    await nojs.close();
  }
  if (project === "desktop") {
    await page.goto("/letters");
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "Letter to the Editor",
    );
    await expect(
      main.getByRole("link", { name: "How to submit a letter" }),
    ).toHaveAttribute("href", "/letters/how-to-submit");
    await expect(main.getByRole("article")).toHaveCount(1);
    await expect(
      main.getByRole("link", { name: `${prefix} story 17`, exact: true }),
    ).toBeVisible();
  }
});
