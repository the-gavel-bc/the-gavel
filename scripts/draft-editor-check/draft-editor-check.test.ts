import { spawnSync } from "node:child_process";
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { createDraftExtensions } from "../../src/lib/articles/draft-document/draft-extensions";
import {
  toEditorDocument,
  fromEditorDocument,
} from "../../src/lib/articles/draft-document/draft-document";
import {
  draftJsonbByteLength,
  type DraftDocument,
} from "../../src/shared/articles/draft-contract/draft-contract";
import {
  literalCases,
  body,
} from "../../src/shared/articles/draft-contract/draft-test-cases";
const inputs = literalCases
  .filter((c) => c.target === "content" && c.want === "ok")
  .map((c) => ({ name: c.name, value: c.value as DraftDocument | null }));
for (const unit of ["a", "😀", '"']) {
  const overhead = draftJsonbByteLength(body(""))!;
  const bytes = draftJsonbByteLength(unit)! - 2;
  inputs.push({
    name: `near-limit native ${unit}`,
    value: body(
      unit.repeat(Math.floor((1048576 - overhead) / bytes)),
    ) as DraftDocument,
  });
}
inputs.push({
  name: "dense linked native attribute overhead",
  value: {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: Array.from({ length: 2000 }, (_, n) => ({
            type: "text",
            text: "x".repeat(400),
            marks: [
              { type: "link", attrs: { href: `https://example.org/${n}` } },
            ],
          })),
        },
      ],
    },
  },
});
const results = inputs.map((input) => {
  const loaded = toEditorDocument(input.value);
  if (!loaded.ok)
    throw new Error("Synthetic editor fixture rejected before loading.");
  const editor = new Editor({
    extensions: createDraftExtensions(),
    content: loaded.document,
    enableContentCheck: true,
  });
  try {
    const result = fromEditorDocument(editor.getJSON());
    if (!result.ok)
      throw new Error("Native fixture output failed canonical validation.");
    return { ...input, document: result.document };
  } finally {
    editor.destroy();
  }
});
const rows = results
  .map(
    (result, index) =>
      `(${index},convert_from(decode('${Buffer.from(JSON.stringify(result.document)).toString("hex")}','hex'),'UTF8')::jsonb)`,
  )
  .join(",");
const query = spawnSync(
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
    "-XAtq",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  {
    input: `begin; select jsonb_build_object('index',i,'valid',private.is_valid_draft_document(v),'bytes',octet_length(v::text)) from(values ${rows}) fixtures(i,v) order by i; rollback;`,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (query.error || query.status !== 0)
  throw new Error(
    "Local editor parity check failed; start the fixed local Supabase project. Body/SQL diagnostics are intentionally not logged.",
  );
const output = query.stdout
  .trim()
  .split("\n")
  .map(
    (line) =>
      JSON.parse(line) as { index: number; valid: boolean; bytes: number },
  );
it("gets one database result per native exported fixture", () =>
  expect(output).toHaveLength(results.length));
for (const [index, result] of results.entries())
  it(`native editor -> canonical -> PostgreSQL: ${result.name}`, () => {
    expect(output[index]).toEqual({
      index,
      valid: true,
      bytes: draftJsonbByteLength(result.document),
    });
    if (result.name.startsWith("near-limit"))
      expect(output[index].bytes).toBeGreaterThan(1048570);
  });
