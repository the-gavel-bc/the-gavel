import { describe, expect, it } from "vitest";
import {
  articleCapabilities,
  type ArticleStanding,
} from "./article-permissions";

const base: ArticleStanding = {
  role: "author",
  isOwner: true,
  status: "draft",
  inReview: false,
  publishedByMe: false,
};
const caps = (patch: Partial<ArticleStanding>) =>
  articleCapabilities({ ...base, ...patch });

describe("articleCapabilities", () => {
  it("lets authors write and submit but never publish", () => {
    expect(caps({})).toMatchObject({
      edit: true,
      submit: true,
      publish: false,
    });
    expect(caps({ inReview: true })).toMatchObject({
      edit: false,
      submit: false,
      publish: false,
    });
    expect(caps({ status: "published" })).toMatchObject({
      edit: false,
      archive: false,
    });
  });
  it("lets editors copy-edit and publish submitted work only", () => {
    const editor = { role: "editor", isOwner: false } as const;
    expect(caps({ ...editor })).toMatchObject({ edit: false, publish: false });
    expect(caps({ ...editor, inReview: true })).toMatchObject({
      edit: true,
      publish: true,
      returnToAuthor: true,
    });
    expect(caps({ ...editor, isOwner: true })).toMatchObject({
      edit: true,
      publish: true,
      submit: false,
    });
    expect(caps({ ...editor, status: "published" }).edit).toBe(false);
  });
  it("limits editor archiving to their own publications", () => {
    const published = {
      role: "editor",
      isOwner: false,
      status: "published",
    } as const;
    expect(caps({ ...published }).archive).toBe(false);
    expect(caps({ ...published, publishedByMe: true }).archive).toBe(true);
    expect(caps({ ...published, publishedByMe: true }).restore).toBe(false);
  });
  it("gives administrators everything", () => {
    const admin = { role: "administrator", isOwner: false } as const;
    expect(caps({ ...admin, status: "published" })).toMatchObject({
      edit: true,
      archive: true,
    });
    expect(caps({ ...admin, status: "archived" }).restore).toBe(true);
    expect(caps({ ...admin })).toMatchObject({ edit: true, publish: true });
  });
  it("lets only editors and administrators add corrections", () => {
    expect(caps({}).correct).toBe(false);
    expect(caps({ status: "published" }).correct).toBe(false);
    const editor = { role: "editor", isOwner: false } as const;
    expect(caps({ ...editor }).correct).toBe(false);
    expect(caps({ ...editor, inReview: true }).correct).toBe(true);
    expect(caps({ ...editor, status: "published" }).correct).toBe(false);
    expect(
      caps({ ...editor, status: "published", publishedByMe: true }).correct,
    ).toBe(true);
    const admin = { role: "administrator", isOwner: false } as const;
    expect(caps({ ...admin }).correct).toBe(true);
    expect(caps({ ...admin, status: "published" }).correct).toBe(true);
    expect(caps({ ...admin, status: "archived" }).correct).toBe(false);
  });
});
