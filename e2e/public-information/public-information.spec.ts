import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { expectVisibleFocus } from "../support/focus/focus";
const workdir = process.env.INFORMATION_BROWSER_WORKDIR;
if (workdir && workdir !== "/private/tmp/gavel-task19-browser")
  throw new Error("Unexpected information browser project");

test("About and submission navigation work without JavaScript", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    const response = await page.goto("/about");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    const main = page.getByRole("main");
    await expect(main).toHaveCount(1);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "About The Gavel",
    );
    const submit = main.getByRole("link", { name: "How to submit a letter" });
    await submit.focus();
    await expectVisibleFocus(submit);
    await submit.click();
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "How to submit a letter",
    );
    await expect(main.locator("form")).toHaveCount(0);
    await main.getByRole("link", { name: "About The Gavel" }).click();
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(
      "About The Gavel",
    );
  } finally {
    await context.close();
  }
});

// State fixtures never mutate the shared CI/working settings singleton. Only the
// dedicated one-worker scratch run exercises and restores these synthetic fields.
if (workdir)
  test("configured, unset and unsafe public copy stays readable and safe", async ({
    browser,
  }, info) => {
    const sql = (statement: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_gavel-task19-browser",
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
    const original = JSON.parse(
      sql("select to_jsonb(s) from public.site_information s;"),
    );
    const update = (data: Record<string, string | null>) =>
      sql(
        `update public.site_information s set mission=v.mission,contact_email=v.contact_email,instagram_url=v.instagram_url,submission_instructions=v.submission_instructions from jsonb_to_record('${JSON.stringify(data).replaceAll("'", "''")}'::jsonb) v(mission text,contact_email text,instagram_url text,submission_instructions text);`,
      );
    const context = await browser.newContext({
      ...info.project.use,
      javaScriptEnabled: false,
    });
    try {
      const page = await context.newPage();
      if (info.project.name === "mobile")
        await page.setViewportSize({ width: 320, height: 900 });
      update({
        mission: "Synthetic mission.\nNext line.\n\nSecond mission paragraph.",
        submission_instructions:
          "Synthetic instructions.\n\n" + "Longword".repeat(400),
        contact_email: "desk?letters@bc.edu",
        instagram_url: "https://www.instagram.com/synthetic_gavel/",
      });
      await page.goto("/about");
      const main = page.getByRole("main");
      const mission = main.getByRole("region", { name: "Our mission" });
      await expect(mission.locator("p")).toHaveCount(2);
      expect(
        await mission
          .locator("p")
          .first()
          .evaluate((p) => getComputedStyle(p).whiteSpace),
      ).toBe("pre-line");
      await expect(
        main.getByRole("link", { name: "desk?letters@bc.edu" }),
      ).toHaveAttribute("href", "mailto:desk%3Fletters%40bc.edu");
      await expect(
        main.getByRole("link", { name: "Instagram" }),
      ).toHaveAttribute("href", "https://www.instagram.com/synthetic_gavel/");
      await page.goto("/letters/how-to-submit");
      await expect(main.getByText("Longword".repeat(400))).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      update({
        mission: null,
        submission_instructions: null,
        contact_email: null,
        instagram_url: null,
      });
      for (const path of ["/about", "/letters/how-to-submit"]) {
        await page.goto(path);
        await expect(main.getByText(/not available yet/)).toBeVisible();
        await expect(
          main.getByRole("heading", { name: "Contact" }),
        ).toHaveCount(0);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          /noindex/,
        );
      }
      update({
        mission: "<script>window.informationInjected=true</script>",
        submission_instructions: "bad\u0001text",
        contact_email: "bad@",
        instagram_url: "https://instagram.com.evil.test/x",
      });
      for (const path of ["/about", "/letters/how-to-submit"]) {
        await page.goto(path);
        await expect(main.getByText(/not available yet/)).toBeVisible();
        await expect(
          main.getByRole("heading", { name: "Contact" }),
        ).toHaveCount(0);
        await expect(main.locator("script")).toHaveCount(0);
      }
    } finally {
      await context.close();
      update(original);
      expect(
        JSON.parse(sql("select to_jsonb(s) from public.site_information s;")),
      ).toEqual(original);
    }
  });
