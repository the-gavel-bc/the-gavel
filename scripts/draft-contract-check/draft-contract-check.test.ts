import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  checkDraftInput,
  draftJsonbByteLength,
  isValidDraftDocument,
  isValidDraftLink,
} from "../../src/shared/articles/draft-contract/draft-contract";
import {
  baseDraft,
  boundaryCases,
  literalCases,
} from "../../src/shared/articles/draft-contract/draft-test-cases";

// Fixed local Docker project, synthetic fixtures, no secrets/hosted DB or shell.
// Encode fixture JSON as hex before composing SQL: body text can never become SQL syntax.
const cases = [...literalCases, ...boundaryCases()];
const rows = cases
  .map((c, index) => {
    const value = Buffer.from(JSON.stringify(c.value), "utf8").toString("hex");
    const draft = Buffer.from(
      JSON.stringify(
        c.target === "draft" ? c.value : { ...baseDraft, content: c.value },
      ),
      "utf8",
    ).toString("hex");
    return `(${index},convert_from(decode('${value}','hex'),'UTF8')::jsonb,convert_from(decode('${draft}','hex'),'UTF8')::jsonb)`;
  })
  .join(",\n");
const result = spawnSync(
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
    input: `begin; select jsonb_build_object('index',i,'link',case when jsonb_typeof(v)='string' then private.is_valid_draft_link(v#>>'{}') else false end,'document',private.is_valid_draft_document(nullif(v,'null'::jsonb)),'result',private.check_draft_input(d),'bytes',octet_length(v::text)) from (values ${rows}) as fixtures(i,v,d) order by i; rollback;`,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 20 * 1024 * 1024,
  },
);
if (result.status !== 0 || result.error)
  throw new Error(
    "Local draft parity query failed; start Supabase and apply migrations. Fixture bodies and database diagnostics are intentionally not printed.",
  );
const output = result.stdout
  .trim()
  .split("\n")
  .map(
    (line) =>
      JSON.parse(line) as {
        index: number;
        link: boolean;
        document: boolean;
        result: ReturnType<typeof checkDraftInput>;
        bytes: number;
      },
  );
describe("TypeScript / PostgreSQL draft contract parity", () => {
  it("returns one DB result per synthetic fixture", () =>
    expect(output.length).toBe(cases.length));
  for (const [index, c] of cases.entries())
    it(c.name, () => {
      const row = output[index];
      expect(row.index).toBe(index);
      const bytes = draftJsonbByteLength(c.value);
      if (bytes !== null) expect(bytes).toBe(row.bytes);
      if (c.target === "link") {
        expect(row.link).toBe(c.want === "ok");
        expect(isValidDraftLink(c.value)).toBe(row.link);
      } else if (c.target === "content") {
        expect(row.document).toBe(c.want === "ok");
        expect(isValidDraftDocument(c.value)).toBe(row.document);
        const ts = checkDraftInput({ ...baseDraft, content: c.value });
        expect(row.result).toEqual(ts);
        expect(ts.ok ? "ok" : ts.code).toBe(c.want);
      } else {
        expect(row.result).toEqual(checkDraftInput(c.value));
        expect(row.result.ok ? "ok" : row.result.code).toBe(c.want);
      }
    });
});
