import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

// Resolve relative imports too: aliases alone are not an ownership boundary.
export const ownershipRule = {
  meta: { type: "problem", schema: [], messages: { boundary: "{{reason}}" } },
  create(context) {
    const filename = context.filename;
    const root = context.cwd;
    const source = path.relative(root, filename).split(path.sep).join("/");
    const test = /\.(test|spec)\.[cm]?[jt]sx?$/.test(source);
    const fixture = source.endsWith("/draft-test-cases.ts");
    const client = context.sourceCode.ast.body.some(
      (node) =>
        node.type === "ExpressionStatement" && node.directive === "use client",
    );
    function check(node, value, typeOnly = false) {
      // Tests need cross-layer fixtures and Node APIs. Application imports of those
      // helpers are rejected below, so the exception does not expose runtime entry points.
      if (typeof value !== "string" || test || fixture) return;
      const absolute = value.startsWith("@/")
        ? path.join(root, "src", value.slice(2))
        : value.startsWith(".")
          ? path.resolve(path.dirname(filename), value)
          : null;
      const target = absolute
        ? path.relative(root, absolute).split(path.sep).join("/")
        : value;
      let reason;
      const builtin = isBuiltin(value);
      if (
        target.includes("draft-test-cases") ||
        target.includes("draft-query-test-client") ||
        /\.(test|spec)(\.|$)/.test(target)
      ) {
        reason =
          "Application modules cannot import test helpers or test suites.";
      } else if (
        source.startsWith("src/shared/") &&
        (builtin ||
          /^(src\/(backend|frontend|app)\/|node:|next(?:\/|$)|server-only$)/.test(
            target,
          ) ||
          (!typeOnly && value.startsWith("@supabase/")))
      ) {
        reason =
          "Shared modules must remain independent of server, presentation, and platform clients.";
      } else if (
        source.startsWith("src/backend/") &&
        /^src\/(frontend|app)\//.test(target)
      ) {
        reason =
          "Backend modules cannot depend on presentation or route entry points.";
      } else if ((source.startsWith("src/frontend/") || client) && !typeOnly) {
        // Type-only imports are erased. Runtime backend imports must resolve to explicit
        // Server Actions, which Next.js replaces with server-call references in the browser.
        if (target.startsWith("src/backend/")) {
          const file = [absolute, `${absolute}.ts`, `${absolute}.tsx`].find(
            (p) => fs.existsSync(p) && fs.statSync(p).isFile(),
          );
          const action =
            file &&
            /^\s*["']use server["'];/.test(fs.readFileSync(file, "utf8"));
          if (!action)
            reason =
              "Presentation can import backend runtime code only through explicit use-server entry points.";
        } else if (
          builtin ||
          /^(node:|server-only$|next\/(headers|server|cache)$)/.test(target)
        ) {
          reason =
            "Move server platform access into backend or framework entry points.";
        }
      }
      if (reason)
        context.report({ node, messageId: "boundary", data: { reason } });
    }
    return {
      ImportDeclaration(node) {
        check(
          node,
          node.source.value,
          node.importKind === "type" ||
            (node.specifiers.length > 0 &&
              node.specifiers.every((s) => s.importKind === "type")),
        );
      },
      ExportNamedDeclaration(node) {
        if (node.source)
          check(node, node.source.value, node.exportKind === "type");
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value, node.exportKind === "type");
      },
      ImportExpression(node) {
        check(node, node.source.value);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require")
          check(node, node.arguments[0]?.value);
      },
    };
  },
};
