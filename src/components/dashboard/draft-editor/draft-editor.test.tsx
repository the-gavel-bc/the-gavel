import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DraftEditor } from "./draft-editor";
it("hydrates an empty editor without changing a NULL body", async () => {
  const change = vi.fn();
  render(
    <DraftEditor
      value={null}
      onChange={change}
      onError={vi.fn()}
      disabled={false}
    />,
  );
  expect(
    await screen.findByRole("textbox", { name: "Article body" }),
  ).toHaveAttribute("contenteditable", "true");
  expect(change).not.toHaveBeenCalled();
});
it("disables native editing and toolbar controls while pending", async () => {
  render(
    <DraftEditor value={null} onChange={vi.fn()} onError={vi.fn()} disabled />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Article body" }),
    ).toHaveAttribute("contenteditable", "false"),
  );
  expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
});
it("rejects HTML paste before it can create nodes or fetch resources", async () => {
  const error = vi.fn(),
    change = vi.fn();
  render(
    <DraftEditor
      value={null}
      onChange={change}
      onError={error}
      disabled={false}
    />,
  );
  const body = await screen.findByRole("textbox", { name: "Article body" });
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: {
      files: [],
      getData: (type: string) =>
        type === "text/html"
          ? '<img src="https://example.org/track" onerror="alert(1)">'
          : "plain fallback",
    },
  });
  fireEvent(body, paste);
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(body.querySelector("img")).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
it("does not load unknown stored content", async () => {
  const error = vi.fn();
  render(
    <DraftEditor
      value={{ format: "legacy" } as never}
      onChange={vi.fn()}
      onError={error}
      disabled={false}
    />,
  );
  expect(
    screen.queryByRole("textbox", { name: "Article body" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(error).toHaveBeenCalled());
});
