// Synthetic fixtures shared by unit and local-DB parity tests; never imported by application code.
import { readFileSync } from "node:fs";
const fixtures = JSON.parse(
  readFileSync("src/lib/articles/draft-contract/draft-cases.json", "utf8"),
) as typeof import("./draft-cases.json");
export type ContractCase = {
  name: string;
  target: "draft" | "content" | "link";
  value: unknown;
  want: string;
};
export const baseDraft = { ...fixtures.baseDraft, schemaVersion: 1 as const };
export const literalCases = fixtures.cases as ContractCase[];
const paragraph = { type: "paragraph" };
export function body(text: string): unknown {
  return {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}
const id = (n: number) =>
  `20000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;
export function boundaryCases(): ContractCase[] {
  const cases: ContractCase[] = [];
  const add = (
    name: string,
    target: ContractCase["target"],
    value: unknown,
    want: string,
  ) => cases.push({ name, target, value, want });
  for (const count of [5000, 5001])
    add(
      `nodes ${count}`,
      "content",
      {
        format: "gavel-draft",
        version: 1,
        document: {
          type: "doc",
          content: Array.from({ length: count - 1 }, () => paragraph),
        },
      },
      count === 5000 ? "ok" : "invalid_input",
    );
  for (const depth of [16, 17]) {
    let node: unknown = paragraph;
    for (let i = 2; i < depth; i++)
      node = { type: "blockquote", content: [node] };
    add(
      `depth ${depth}`,
      "content",
      {
        format: "gavel-draft",
        version: 1,
        document: { type: "doc", content: [node] },
      },
      depth === 16 ? "ok" : "invalid_input",
    );
  }
  for (const length of [2048, 2049])
    add(
      `href ${length}`,
      "link",
      "https://example.test/" + "a".repeat(length - 21),
      length === 2048 ? "ok" : "invalid_input",
    );
  for (const [field, cap] of [
    ["categoryIds", 32],
    ["tagIds", 64],
    ["contributors", 32],
  ] as const)
    for (const count of [cap, cap + 1])
      add(
        `${field} ${count}`,
        "draft",
        {
          ...baseDraft,
          [field]: Array.from({ length: count }, (_, i) =>
            field === "contributors"
              ? { profileId: id(i + 1), role: "writer", displayOrder: i }
              : id(i + 1),
          ),
        },
        count === cap ? "ok" : "invalid_input",
      );
  for (const [field, cap] of [
    ["title", 240],
    ["excerpt", 600],
    ["seoKeyphrase", 160],
    ["metaDescription", 320],
  ] as const)
    for (const count of [cap, cap + 1])
      add(
        `${field} chars ${count}`,
        "draft",
        { ...baseDraft, [field]: "a".repeat(count) },
        count === cap ? "ok" : "invalid_input",
      );
  // Hand-counted JSONB text overhead of body("") is 147 UTF-8 bytes.
  for (const unit of ["a", "é", "😀", '"', "\n"])
    for (const extra of [0, 1]) {
      const bytes =
        unit === "é"
          ? 2
          : unit === "😀"
            ? 4
            : unit === '"' || unit === "\n"
              ? 2
              : 1;
      const room = 1048576 - 147 + extra;
      add(
        `body bytes ${unit.codePointAt(0)} ${1048576 + extra}`,
        "content",
        body(unit.repeat(Math.floor(room / bytes)) + "a".repeat(room % bytes)),
        extra === 0 ? "ok" : "invalid_input",
      );
    }
  // A payload can be over 1,100,000 bytes while containing an individually valid body:
  // an oversized unknown property must be rejected before descending into it.
  add(
    "oversized payload",
    "draft",
    { ...baseDraft, extra: "x".repeat(1100001) },
    "invalid_input",
  );
  return cases;
}
