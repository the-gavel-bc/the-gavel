import { fireEvent, render, screen } from "@testing-library/react";
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
});

it("keeps the page search a plain submit form", () => {
  render(<SearchForm id="page-search" />);
  expect(screen.getByRole("button", { name: "Search" })).not.toHaveAttribute(
    "aria-expanded",
  );
});
