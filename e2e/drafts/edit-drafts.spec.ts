import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { draftJsonbByteLength } from "../../src/lib/articles/draft-contract/draft-contract";
import { setLocalSession } from "../support/local-supabase/local-supabase";
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
let saveActionId: string;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "edit");
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());
test("owner formats saves and reopens a private body with a second versioned save", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  const body = page.getByRole("textbox", { name: "Article body" });
  await expect(body).toBeVisible();
  await body.fill("A synthetic body paragraph.");
  await body.selectText();
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByLabel("Link URL").fill("https://example.org/story");
  await page.getByRole("button", { name: "Apply link" }).click();
  await expect(body.locator("strong")).toContainText("synthetic body");
  await expect(body.locator("a")).toHaveAttribute(
    "href",
    "https://example.org/story",
  );
  page.on("request", (request) => {
    const action = request.headers()["next-action"];
    if (request.method() === "POST" && action) saveActionId = action;
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  const saved = fixture.article(21);
  expect(saved.article.edit_version).toBe(2);
  expect(saved.revisions).toBe(1);
  expect(saved.audits).toBe(1);
  expect(saved.article.content.format).toBe("gavel-draft");
  const marks = saved.article.content.document.content[0].content[0].marks;
  expect(
    marks.find((mark: { type: string }) => mark.type === "link").attrs,
  ).toEqual({ href: "https://example.org/story" });
  await page.reload();
  await expect(body).toContainText("A synthetic body paragraph.");
  await body.click();
  await body.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await body.press("Enter");
  await body.pressSequentially("A second paragraph.");
  await expect(body.locator("p")).toHaveText([
    "A synthetic body paragraph.",
    "A second paragraph.",
  ]);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  expect(fixture.article(21).article.edit_version).toBe(3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("edit-draft.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(body.locator("p")).toHaveText([
    "A synthetic body paragraph.",
    "A second paragraph.",
  ]);
});
test("blocks unsafe paste before parsing and recovers with plain text", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  const body = page.getByRole("textbox", { name: "Article body" });
  await expect(body).toBeVisible();
  const before = fixture.article(21);
  let fetched = false;
  await page.route("**/tracking-image", (route) => {
    fetched = true;
    return route.abort();
  });
  await body.evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<img src="https://example.org/tracking-image" onerror="alert(1)">',
    );
    data.setData("text/plain", "fallback");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Paste was blocked" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(body.locator("img")).toHaveCount(0);
  expect(fetched).toBe(false);
  const paragraphs = await body.locator("p").count();
  await body.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "\n".repeat(100000));
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Pasted text exceeds" }),
  ).toBeVisible();
  await expect(body).toHaveAttribute("aria-invalid", "true");
  await expect(body).toHaveAccessibleDescription(/Pasted text exceeds/);
  await expect(body.locator("p")).toHaveCount(paragraphs);
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  expect(fixture.article(21)).toEqual(before);
  await body.focus();
  await body.press("ControlOrMeta+End");
  await body.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", " Safe pasted text.");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
});
test("another author cannot edit while an administrator can save the same draft", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.other);
  const denied = await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  expect(denied?.status()).toBe(404);
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await setLocalSession(context, fixture.users.admin);
  await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  const before = fixture.article(21);
  await page.getByLabel(/Title/).fill(`${fixture.label} administrator edit`);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  const after = fixture.article(21);
  expect(after.article.edit_version).toBe(before.article.edit_version + 1);
  expect(after.article.content).toEqual(before.article.content);
});
test("published archived and legacy content stay read-only; unavailable sections are repairable", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  for (const [number, status] of [
    [20, "published"],
    [19, "archived"],
  ] as const) {
    const before = fixture.article(number);
    await page.goto(`/dashboard/articles/${fixture.id(number)}`);
    await expect(
      page.getByText(new RegExp(`This article is ${status}`)),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(
      0,
    );
    expect(fixture.article(number)).toEqual(before);
  }
  fixture.legacy();
  const legacy = fixture.article(18);
  await page.goto(`/dashboard/articles/${fixture.id(18)}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "preserved" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Article body" })).toHaveCount(
    0,
  );
  expect(fixture.article(18)).toEqual(legacy);
  fixture.setSectionActive(false);
  try {
    await page.goto(`/dashboard/articles/${fixture.id(21)}`);
    await expect(
      page.getByRole("option", {
        name: `Unavailable section: ${fixture.id(99)}`,
      }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Choose an active section",
    );
  } finally {
    fixture.setSectionActive(true);
  }
});
test("unapproved identities cannot load the editor", async ({
  context,
  page,
}) => {
  await setLocalSession(context, 5);
  await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  await expect(page).toHaveURL(/\/access-pending$/);
  await expect(page.getByRole("textbox", { name: "Article body" })).toHaveCount(
    0,
  );
});

test("accepts a near-limit canonical body through the real action transport", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  const current = fixture.article(21).article;
  const content = {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
    },
  };
  const overhead = draftJsonbByteLength(content)!;
  content.document.content[0].content[0].text = "a".repeat(1048576 - overhead);
  const draft = {
    schemaVersion: 1,
    title: current.title,
    slug: current.slug,
    sectionId: current.section_id,
    excerpt: current.excerpt,
    content,
    seoKeyphrase: current.seo_keyphrase,
    metaDescription: current.meta_description,
    categoryIds: [],
    tagIds: [],
    contributors: [],
  };
  const payload = JSON.stringify([
    {
      requestId: crypto.randomUUID(),
      articleId: fixture.id(21),
      expectedVersion: current.edit_version,
      draft,
    },
  ]);
  expect(Buffer.byteLength(payload)).toBeGreaterThan(1048576);
  const response = await page.request.post(
    `/dashboard/articles/${fixture.id(21)}`,
    {
      headers: {
        "Next-Action": saveActionId,
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: "http://127.0.0.1:3100",
      },
      data: payload,
    },
  );
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('"ok":true');
  const saved = fixture.article(21).article;
  expect(saved.edit_version).toBe(current.edit_version + 1);
  expect(draftJsonbByteLength(saved.content)).toBe(1048576);
});
