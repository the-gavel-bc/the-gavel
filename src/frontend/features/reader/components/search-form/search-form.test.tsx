import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
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
