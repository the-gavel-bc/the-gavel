import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock(
  "@/backend/site-information/site-information/site-information-actions",
  () => ({ saveSiteInformationAction: mocks.save }),
);
import { SiteInformationForm } from "./site-information-form";
const information = {
  version: 1,
  mission: null,
  contactEmail: null,
  instagramUrl: null,
  submissionInstructions: null,
};
describe("site information form", () => {
  beforeEach(() => vi.clearAllMocks());
  it("saves plain text and shows confirmation", async () => {
    mocks.save.mockResolvedValue({
      ok: true,
      version: 2,
      changed: true,
      replayed: false,
    });
    render(<SiteInformationForm information={information} />);
    fireEvent.change(screen.getByLabelText("Mission"), {
      target: { value: "Our mission" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save site information" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Site information saved.")).toBeInTheDocument(),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ mission: "Our mission", contactEmail: null }),
    );
  });
  it("protects unsaved input and offers conflict recovery", async () => {
    mocks.save.mockResolvedValue({ ok: false, code: "conflict" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SiteInformationForm information={information} />);
    fireEvent.change(screen.getByLabelText("Mission"), {
      target: { value: "Unsaved" },
    });
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Save site information" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Reload site information" }),
    );
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Mission")).toHaveValue("Unsaved");
    confirm.mockRestore();
  });
  it("retains the original request for an uncertain result", async () => {
    mocks.save
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        version: 2,
        changed: true,
        replayed: true,
      });
    render(<SiteInformationForm information={information} />);
    fireEvent.change(screen.getByLabelText("Mission"), {
      target: { value: "Our mission" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save site information" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry original request" }),
    );
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[0][0]).toEqual(mocks.save.mock.calls[1][0]);
  });
});
