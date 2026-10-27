import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";
import { ApiClientError } from "@/components/household-data/api-client";
import { setTestLocale } from "@/i18n/__tests__/test-locale";
import type { DraftView } from "@/lib/household-data/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ApartmentsPage from "../page";

function draft(over: Partial<DraftView> = {}): DraftView {
  return {
    id: "d1",
    corrupt: false,
    url: "https://www.example.ch/listing/42",
    title: null,
    createdBy: "u1",
    createdByName: "Lena",
    createdAt: "2026-03-20T10:00:00Z",
    ...over,
  } as DraftView;
}

function setClipboard(readText: (() => Promise<string>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: readText ? { readText } : undefined,
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  setClipboard(undefined);
});

describe("To add strip", () => {
  it("is absent with no drafts, in the list and the empty state", () => {
    renderWithHouseholdData(<ApartmentsPage />, { drafts: [] });
    expect(screen.queryByText("To add")).not.toBeInTheDocument();
    cleanup();
    renderWithHouseholdData(<ApartmentsPage />, { drafts: [], apartments: [] });
    expect(screen.queryByText("To add")).not.toBeInTheDocument();
  });

  it("shows host, sharer, date; Add links to the draft; Delete calls deleteDraft", async () => {
    const { value: data } = renderWithHouseholdData(<ApartmentsPage />, { drafts: [draft()] });
    expect(screen.getByText("To add")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "www.example.ch" });
    expect(link).toHaveAttribute("href", "https://www.example.ch/listing/42");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/Lena, /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add" })).toHaveAttribute(
      "href",
      "/apartments/new?draft=d1"
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(data.deleteDraft).toHaveBeenCalledWith("d1");
  });

  it("shows the title when there is one and formerMember when the sharer is gone", () => {
    renderWithHouseholdData(<ApartmentsPage />, {
      drafts: [draft({ title: "Nice flat", createdByName: null })],
    });
    expect(screen.getByRole("link", { name: "Nice flat" })).toBeInTheDocument();
    expect(screen.getByText(/Former member, /)).toBeInTheDocument();
  });

  it("shows only Delete for a corrupt draft", () => {
    renderWithHouseholdData(<ApartmentsPage />, {
      drafts: [draft({ corrupt: true, url: null, title: null })],
    });
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("is titled in German under the German locale", () => {
    setTestLocale("de");
    renderWithHouseholdData(<ApartmentsPage />, { drafts: [draft()] });
    expect(screen.getByText("Zum Hinzufügen")).toBeInTheDocument();
  });
});

describe("Paste link", () => {
  it("creates a draft from a link on the clipboard", async () => {
    setClipboard(vi.fn().mockResolvedValue("see https://x.ch/a now"));
    const { value: data } = renderWithHouseholdData(<ApartmentsPage />, {});
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    await waitFor(() => expect(data.createDraft).toHaveBeenCalled());
    expect(data.createDraft).toHaveBeenCalledWith("see https://x.ch/a now", null);
  });

  it("says so when the clipboard holds no link", async () => {
    setClipboard(vi.fn().mockResolvedValue("just words"));
    renderWithHouseholdData(<ApartmentsPage />, {
      createDraft: vi.fn().mockRejectedValue(new Error("Not a web link")),
    });
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    expect(await screen.findByText(/no link/i)).toBeInTheDocument();
  });

  it("falls back to a field when reading fails, and Save creates the draft", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    const { value: data } = renderWithHouseholdData(<ApartmentsPage />, {});
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    const field = await screen.findByLabelText("Paste the link here");
    await userEvent.type(field, "https://y.ch/b");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(data.createDraft).toHaveBeenCalledWith("https://y.ch/b", null));
  });

  it("falls back to the field when the clipboard API is missing", async () => {
    setClipboard(undefined);
    renderWithHouseholdData(<ApartmentsPage />, {});
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    expect(await screen.findByLabelText("Paste the link here")).toBeInTheDocument();
  });

  it("shows the full message on 409 Too many drafts", async () => {
    setClipboard(vi.fn().mockResolvedValue("https://x.ch/a"));
    renderWithHouseholdData(<ApartmentsPage />, {
      createDraft: vi.fn().mockRejectedValue(new ApiClientError(409, "Too many drafts", {})),
    });
    await userEvent.click(screen.getByRole("button", { name: "Paste link" }));
    expect(await screen.findByText(/list of links to add is full \(20\)/)).toBeInTheDocument();
  });

  it("is also offered in the empty state", () => {
    renderWithHouseholdData(<ApartmentsPage />, { apartments: [] });
    expect(screen.getByRole("button", { name: "Paste link" })).toBeInTheDocument();
  });
});
