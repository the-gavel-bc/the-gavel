import { beforeEach, expect, it, vi } from "vitest";
import {
  queryTestClient,
  articleId,
  profileId,
} from "@/backend/articles/draft-queries/draft-query-test-client";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
import { getHomepageImageUrls } from "./homepage-images";

let http: ReturnType<typeof queryTestClient>;
beforeEach(() => {
  vi.clearAllMocks();
  http = queryTestClient();
  mocks.client.mockResolvedValue(http.client);
});

it("maps stories with a main image to the public image route", async () => {
  http.respond([{ article_id: articleId, asset_id: profileId }]);
  expect(
    await getHomepageImageUrls([articleId, articleId, "not-a-uuid"]),
  ).toEqual({
    [articleId]: `/api/public/articles/${articleId}/media/${profileId}`,
  });
});

it("returns nothing for no ids and degrades to no images on failure", async () => {
  expect(await getHomepageImageUrls([])).toEqual({});
  expect(http.network).not.toHaveBeenCalled();
  http.respond({ message: "private" }, 500);
  expect(await getHomepageImageUrls([articleId])).toEqual({});
});
