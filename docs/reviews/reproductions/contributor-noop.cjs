// Reproduces a reviewed failure with local mocks; no external service is contacted.
// A successful exit confirms the documented failure, not that the application is fixed.
const { resolve } = require("node:path");
const repoRoot = resolve(__dirname, "../../..");
const { createRequire } = require("node:module");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const req = createRequire(resolve(repoRoot, "package.json"));
const { JSDOM } = req("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const React = req("react");
const { render, fireEvent, act } = req("@testing-library/react");
const ts = req("typescript");
const source = readFileSync(
  resolve(
    repoRoot,
    "src/frontend/features/contributors/components/admin-contributors/contributor-controls.tsx",
  ),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
let refreshes = 0;
const person = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Guest",
  biography: null,
  active: true,
  version: 1,
  referencedLive: false,
};
const mod = { exports: {} };
vm.runInNewContext(js, {
  module: mod,
  exports: mod.exports,
  crypto: global.crypto,
  window: dom.window,
  require: (name) =>
    name === "next/navigation"
      ? { useRouter: () => ({ refresh: () => refreshes++ }) }
      : name.includes("contributor-actions")
        ? {
            manageContributorAction: async () => ({
              ok: true,
              changed: false,
              profileId: person.id,
              version: 1,
              active: true,
            }),
          }
        : req(name),
});
(async () => {
  const make = () =>
    React.createElement(mod.exports.ContributorControls, {
      key: `${person.id}:${person.version}:${person.active}`,
      contributor: { ...person },
    });
  const view = render(make());
  const button = view.getByRole("button", { name: "Save contributor" });
  const before = button.disabled;
  await act(async () => fireEvent.click(button));
  view.rerender(make());
  const result = {
    beforeDisabled: before,
    afterSameVersionRefreshDisabled: view.getByRole("button", {
      name: "Save contributor",
    }).disabled,
    refreshes,
  };
  console.log(JSON.stringify(result));
  if (before || !result.afterSameVersionRefreshDisabled || refreshes !== 1)
    process.exitCode = 1;
  view.unmount();
  dom.window.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
