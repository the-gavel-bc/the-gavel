import { ESLint } from "eslint";
import { expect, it } from "vitest";
const eslint = new ESLint();
const cases = [
  [
    "blocks bare Node exports",
    "src/shared/example.ts",
    'export { readFile } from "fs";',
    1,
  ],
  [
    "blocks bare Node subpaths",
    "src/frontend/example.ts",
    'import "fs/promises";',
    1,
  ],
  [
    "blocks alias server reads",
    "src/frontend/features/articles/example.ts",
    'import { getMyArticlesPage } from "@/backend/articles/draft-queries/draft-queries";',
    1,
  ],
  [
    "blocks relative server reads",
    "src/frontend/example.ts",
    'import "../backend/articles/draft-queries/draft-queries";',
    1,
  ],
  [
    "blocks dynamic server reads",
    "src/frontend/example.ts",
    'import("../backend/articles/draft-queries/draft-queries");',
    1,
  ],
  [
    "blocks backend presentation imports",
    "src/backend/example.ts",
    'import "@/frontend/components/ui/button/button";',
    1,
  ],
  [
    "blocks shared server types",
    "src/shared/example.ts",
    'import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";',
    1,
  ],
  [
    "blocks shared Node APIs",
    "src/shared/example.ts",
    'import fs from "node:fs";',
    1,
  ],
  [
    "blocks client route server reads",
    "src/app/example.tsx",
    '"use client"; import "@/backend/articles/draft-queries/draft-queries";',
    1,
  ],
  [
    "blocks test helper leakage",
    "src/shared/example.ts",
    'import "./articles/draft-contract/draft-test-cases";',
    1,
  ],
  [
    "permits server actions",
    "src/frontend/example.ts",
    'import { saveDraftAction } from "@/backend/articles/draft-actions/draft-actions";',
    0,
  ],
  [
    "permits erased query types",
    "src/frontend/example.ts",
    'import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";',
    0,
  ],
  [
    "permits shared contracts",
    "src/frontend/example.ts",
    'import { checkDraftInput } from "@/shared/articles/draft-contract/draft-contract";',
    0,
  ],
];
for (const [name, filePath, code, expected] of cases) {
  it(name, { timeout: 15_000 }, async () => {
    const [result] = await eslint.lintText(code, { filePath });
    expect(
      result.messages.filter((m) => m.ruleId === "ownership/boundaries"),
    ).toHaveLength(expected);
  });
}
