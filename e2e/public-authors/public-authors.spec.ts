import { lockAccountFixtureCleanup } from "../../scripts/test-support/audit-fixture-cleanup";
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
let project: string;
let userNumber: number;
let id: (n: number) => string;
let installed = false;
const userId = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
function sql(statement: string) {
  localSupabase();
  execFileSync(
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
  project = info.project.name;
  prefix = `author-${project}`;
  userNumber = project === "desktop" ? 4001 : 4101;
  id = (n) =>
    `7e000000-0000-0000-0000-${String((project === "desktop" ? 1000 : 2000) + n).padStart(12, "0")}`;
  sql(`do $$ begin if exists(select 1 from public.profiles where slug like '${prefix}-%') or exists(select 1 from public.sections where slug like '${prefix}-%') or exists(select 1 from auth.users where id in ('${userId(userNumber)}','${userId(userNumber + 1)}')) then raise exception 'Public author fixture collision'; end if; end $$;
    insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,encrypted_password,confirmation_token,recovery_token,email_change_token_new,email_change_token_current,email_change,phone_change,phone_change_token,reauthentication_token)
    select value::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','${prefix}-'||right(value,4)||'@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','','','','','' from unnest(array['${userId(userNumber)}','${userId(userNumber + 1)}']) value;
    insert into public.profiles(id,auth_user_id,display_name,slug,biography,active) values
      ('${id(301)}','${userId(userNumber)}','Member Writer ${project}','${prefix}-member',E'Literal <script>window.authorBioExecuted=true</script>\n\nSecond paragraph.',true),
      ('${id(302)}',null,'Guest Writer ${project}','${prefix}-guest',E'Literal <script>window.authorBioExecuted=true</script>\n\nSecond paragraph.',true),
      ('${id(303)}',null,'Empty Writer ${project}','${prefix}-empty',null,true),
      ('${id(304)}','${userId(userNumber + 1)}','Inactive Writer ${project}','${prefix}-inactive','Hidden author biography.',false);
    insert into public.memberships(user_id,role,active,approved_by,approved_at,revoked_at) values('${userId(userNumber)}','author',true,'00000000-0000-0000-0000-000000000004',now(),null);
    insert into public.sections(id,name,slug,active) values('${id(101)}','Author News ${project}','${prefix}-news',true),('${id(102)}','Author Hidden ${project}','${prefix}-hidden',false);
    insert into public.articles(id,owner_profile_id,section_id,title,slug,content,status,published_at,archived_at)
    select ('7e000000-0000-0000-0000-'||lpad((${project === "desktop" ? 1000 : 2000}+n)::text,12,'0'))::uuid,
      case when n in (2,16) then '10000000-0000-0000-0000-000000000003'::uuid else '${id(301)}'::uuid end,
      case when n=17 then '${id(102)}'::uuid else '${id(101)}'::uuid end,
      '${prefix} story '||n,'${prefix}-story-'||n,
      '{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic author article body."}]}]}}'::jsonb,
      case n when 14 then 'draft'::public.article_status when 15 then 'archived'::public.article_status else 'published'::public.article_status end,
      case when n!=14 then '2026-11-10T00:00:00Z'::timestamptz+n*interval '1 second' else null end,
      case when n=15 then now() else null end from generate_series(1,17) n;
    insert into public.article_contributors(article_id,profile_id,contribution_role) select id,'${id(302)}','writer' from public.articles where slug like '${prefix}-story-%' and slug!='${prefix}-story-16';
    insert into public.article_contributors(article_id,profile_id,contribution_role) values('${id(1)}','${id(302)}','editor'),('${id(1)}','${id(301)}','writer'),('${id(1)}','${id(301)}','editor'),('${id(2)}','${id(301)}','creative');`);
  installed = true;
});
test.afterAll(() => {
  if (!installed) return;
  sql(`${lockAccountFixtureCleanup}delete from public.article_contributors where article_id in (select id from public.articles where slug like '${prefix}-story-%');
    delete from private.article_id_registry where article_id in (select id from public.articles where slug like '${prefix}-story-%');
    delete from public.articles where slug like '${prefix}-story-%';delete from public.sections where slug like '${prefix}-%';
    delete from public.memberships where user_id in ('${userId(userNumber)}','${userId(userNumber + 1)}');delete from public.profiles where slug like '${prefix}-%';delete from auth.users where id in ('${userId(userNumber)}','${userId(userNumber + 1)}');`);
});

test("member links open escaped biographies and one-off credits stay unlinked", async ({
  page,
}) => {
  if (project === "mobile")
    await page.setViewportSize({ width: 320, height: 900 });
  const main = page.getByRole("main");
  await page.goto(`/articles/${prefix}-story-1`);
  const story = main.getByRole("article", {
    name: `${prefix} story 1`,
    exact: true,
  });
  await expect(
    story.getByText(`Guest Writer ${project}`).first(),
  ).toBeVisible();
  await expect(
    story.getByRole("link", { name: `Guest Writer ${project}` }),
  ).toHaveCount(0);
  await story
    .getByRole("link", { name: `Member Writer ${project}`, exact: true })
    .first()
    .click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    `Member Writer ${project}`,
  );
  const bio = main.getByRole("region", {
    name: `About Member Writer ${project}`,
  });
  await expect(bio).toHaveText(
    /Literal <script>window.authorBioExecuted=true<\/script>\s+Second paragraph\./,
  );
  expect(
    await bio.locator("p").evaluate((p) => getComputedStyle(p).whiteSpace),
  ).toBe("pre-line");
  expect(await page.evaluate(() => "authorBioExecuted" in window)).toBe(false);
  await expect(main.getByRole("article")).toHaveCount(12);
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
  await page.goto(
    `/authors/${prefix}-member?cursor=${encodeURIComponent(cursor + "!")}`,
  );
  await expect(
    main.getByText("This article page is invalid or expired."),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(
    main.getByRole("link", { name: "Newest articles" }),
  ).toHaveAttribute("href", `/authors/${prefix}-member`);
  await main.getByRole("link", { name: "Newest articles" }).click();
  await expect(main.getByRole("article")).toHaveCount(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("public author pages hide inactive profiles and private stories", async ({
  page,
  context,
  browser,
}) => {
  const main = page.getByRole("main");
  const response = await page.goto(`/authors/${prefix}-member`);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(main.getByRole("article")).toHaveCount(12);
  const anonymous = await main.innerText();
  await setLocalSession(context, userNumber);
  await page.reload();
  await expect(main).toHaveText(anonymous, { useInnerText: true });
  const html = await page.content();
  expect(html).not.toContain(userId(userNumber));
  expect(html).not.toContain(`${prefix}-${String(userNumber)}@bc.edu`);
  for (const n of [14, 15, 16, 17])
    await expect(
      main.getByText(`${prefix} story ${n}`, { exact: true }),
    ).toHaveCount(0);
  await setLocalSession(context, userNumber + 1);
  for (const slug of ["inactive", "missing"]) {
    expect((await page.goto(`/authors/${prefix}-${slug}`))?.status()).toBe(404);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "Archive not found",
    );
    await expect(main.getByText("Hidden author biography.")).toHaveCount(0);
  }
  for (const slug of ["empty", "guest"]) {
    expect((await page.goto(`/authors/${prefix}-${slug}`))?.status()).toBe(404);
  }
  await page.goto(`/authors/${prefix}-member?cursor=one&cursor=two`);
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
      .getByRole("article", { name: `${prefix} story 1`, exact: true })
      .getByRole("link", { name: `Member Writer ${project}`, exact: true })
      .first()
      .click();
    await expect(content.getByRole("article")).toHaveCount(12);
    await expect(
      content.getByRole("region", { name: `About Member Writer ${project}` }),
    ).toBeVisible();
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
      content.getByText("Synthetic author article body."),
    ).toBeVisible();
  } finally {
    await nojs.close();
  }
});

test("deactivated members have a plain byline and no public author page", async ({
  page,
}) => {
  sql(
    `update public.memberships set active=false,revoked_at=now() where user_id='${userId(userNumber)}';`,
  );
  const hidden = await page.goto(`/authors/${prefix}-member`);
  expect(hidden?.status()).toBe(404);
  const story = await page.goto(`/articles/${prefix}-story-1`);
  expect(story?.status()).toBe(200);
  const main = page.getByRole("main");
  await expect(
    main.getByText(`By Guest Writer ${project}, Member Writer ${project}`, {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: `Member Writer ${project}`, exact: true }),
  ).toHaveCount(0);
  await expect(
    main.getByText("Second paragraph.", { exact: false }),
  ).toHaveCount(0);
});
