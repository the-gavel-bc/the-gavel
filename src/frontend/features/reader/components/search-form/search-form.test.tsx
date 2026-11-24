import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SearchForm } from "./search-form";
it("submits a labeled native GET query without retaining a cursor", () => {
  render(<SearchForm id="query" query={'<script>" & campus'} />);
  const form = screen.getByRole("search");
  expect(form).toHaveAttribute("action", "/search");
  expect(form).toHaveAttribute("method", "get");
  expect(screen.getByRole("searchbox", { name: "Search stories" })).toHaveValue(
    '<script>" & campus',
  );
  expect(form.querySelector('[name="cursor"]')).toBeNull();
  expect(form.querySelector("script")).toBeNull();
  expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute(
    "type",
    "submit",
  );
});
it("associates instructions and invalid feedback with the input", () => {
  render(<SearchForm id="query" invalid />);
  expect(screen.getByRole("searchbox")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("searchbox")).toHaveAccessibleDescription(
    /160 characters/,
  );
});
it("allows enough UTF-16 units for 160 supplementary code points", () => {
  render(<SearchForm id="query" />);
  expect(screen.getByRole("searchbox")).toHaveAttribute("maxLength", "320");
});

it("opens the navigation field on the first press instead of submitting", () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  render(<SearchForm id="nav-search" navigation />);
  const form = screen.getByRole("search", { name: "Site search" });
  form.addEventListener("submit", submit);
  const button = screen.getByRole("button", { name: "Search" });
  const input = screen.getByRole("searchbox", { name: "Search stories" });

  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  expect(input).toHaveFocus();
  expect(submit).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: "budget" } });
  fireEvent.click(button);
  expect(submit).toHaveBeenCalledOnce();

  fireEvent.change(input, { target: { value: "" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  // Focus returns to the search button instead of dropping to the page.
  expect(button).toHaveFocus();
});

it("closes the open navigation bar when the icon is pressed again", () => {
  const submit = vi.fn((event: Event) => event.preventDefault());
  render(<SearchForm id="nav-search" navigation />);
  screen
    .getByRole("search", { name: "Site search" })
    .addEventListener("submit", submit);
  const button = screen.getByRole("button", { name: "Search" });
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  fireEvent.mouseDown(button);
  fireEvent.click(button, { detail: 1 });
  expect(button).toHaveAttribute("aria-expanded", "false");
  // A pointer press leaves nothing focused, so no focus ring is drawn.
  expect(button).not.toHaveFocus();
  expect(document.activeElement).toBe(document.body);
  expect(submit).not.toHaveBeenCalled();

  // From the keyboard, focus stays on the button.
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(button, { detail: 0 });
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(button).toHaveFocus();
});

it("keeps the page search a plain submit form", () => {
  render(<SearchForm id="page-search" />);
  expect(screen.getByRole("button", { name: "Search" })).not.toHaveAttribute(
    "aria-expanded",
  );
});

it("suggests stories while typing and links straight to them", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn<(url: string) => Promise<Response>>(async () =>
    Response.json({
      kind: "ok",
      items: [{ title: "Budget vote", slug: "budget-vote", section: "News" }],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  try {
    render(<SearchForm id="nav-search" navigation />);
    const input = screen.getByRole("searchbox", { name: "Search stories" });
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "b" } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "bu" } });
    fireEvent.change(input, { target: { value: "bud" } });
    expect(screen.getByRole("status")).toHaveTextContent("Searching");
    await act(() => vi.advanceTimersByTimeAsync(400));
    // Debounced: only the settled query is requested.
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toBe(
      "/api/public/search/suggestions?q=bud",
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 story");
    expect(screen.getByRole("link", { name: /Budget vote/ })).toHaveAttribute(
      "href",
      "/articles/budget-vote",
    );
    expect(
      screen.getByRole("link", { name: "See all results" }),
    ).toHaveAttribute("href", "/search?q=bud");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: /Budget vote/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toHaveFocus();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
