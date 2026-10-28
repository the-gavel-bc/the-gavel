import type { Page, Route } from "@playwright/test";
export async function draftActionBarrier(
  page: Page,
  path: string,
  mode: "hold" | "drop" = "hold",
) {
  let release!: () => void,
    finished!: () => void,
    failed!: (error: unknown) => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committed = new Promise<void>((resolve, reject) => {
    finished = resolve;
    failed = reject;
  });
  const bodies: string[] = [];
  let first = true;
  const pattern = `**${path}`;
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) {
      await route.continue();
      return;
    }
    bodies.push(request.postData()!);
    if (!first) {
      await route.continue();
      return;
    }
    first = false;
    try {
      const response = await route.fetch();
      finished();
      if (mode === "drop") await route.abort("failed");
      else {
        await gate;
        await route.fulfill({ response });
      }
    } catch (error) {
      failed(error);
      throw error;
    }
  };
  await page.route(pattern, handler);
  return {
    bodies,
    committed,
    release,
    dispose: async () => {
      release();
      await page.unroute(pattern, handler);
    },
  };
}
