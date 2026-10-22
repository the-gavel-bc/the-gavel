import { expect, it } from "vitest";
import { loadDraftOptions } from "./draft-options";
import {
  profileId,
  queryTestClient,
} from "../draft-queries/draft-query-test-client";
it("explicitly filters active choices and the matching active category parent", async () => {
  const http = queryTestClient();
  http.respond([{ id: profileId, name: "News" }]);
  http.respond([{ id: profileId, name: "Campus", section_id: profileId }]);
  http.respond([{ id: profileId, name: "Tag" }]);
  http.respond([{ id: profileId, display_name: "Guest", slug: "guest" }]);
  expect(await loadDraftOptions(http.client, profileId)).toEqual({
    sections: [{ id: profileId, name: "News" }],
    categories: [{ id: profileId, name: "Campus", sectionId: profileId }],
    tags: [{ id: profileId, name: "Tag" }],
    contributors: [{ id: profileId, displayName: "Guest", slug: "guest" }],
  });
  const urls = http.network.mock.calls.map((call) => new URL(String(call[0])));
  for (const index of [0, 1, 3])
    expect(urls[index].searchParams.get("active")).toBe("eq.true");
  expect(urls[1].searchParams.get("section_id")).toBe(`eq.${profileId}`);
  expect(urls[1].searchParams.get("sections.active")).toBe("eq.true");
  expect(urls[1].searchParams.get("select")).toContain(
    "sections!inner(active)",
  );
  expect(urls[3].searchParams.get("select")).toBe("id,display_name,slug");
});
it("does not load categories until a section is selected", async () => {
  const http = queryTestClient();
  for (let i = 0; i < 3; i++) http.respond([]);
  expect(await loadDraftOptions(http.client)).toEqual({
    sections: [],
    categories: [],
    tags: [],
    contributors: [],
  });
  expect(
    http.network.mock.calls.some((call) =>
      String(call[0]).includes("/categories"),
    ),
  ).toBe(false);
});
it("fails safely rather than returning partial catalogs", async () => {
  const http = queryTestClient();
  http.respond({ message: "private SQL" }, 500);
  http.respond([]);
  http.respond([]);
  await expect(loadDraftOptions(http.client)).rejects.toThrow(
    /^Unable to load draft options\.$/,
  );
});
