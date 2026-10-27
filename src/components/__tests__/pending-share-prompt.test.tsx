import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SharedItem } from "@/lib/share-stash";

const push = vi.fn();
let pathname = "/apartments";
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

const listShares = vi.fn<() => Promise<SharedItem[]>>();
const deleteShare = vi.fn<(id: string) => Promise<void>>(async () => {});
vi.mock("@/lib/share-stash", () => ({
  listShares: () => listShares(),
  deleteShare: (id: string) => deleteShare(id),
}));

import { PendingSharePrompt } from "../pending-share-prompt";

function entry(id: string, files: number): SharedItem {
  return {
    id,
    createdAt: 1,
    title: null,
    text: null,
    url: null,
    files: Array.from({ length: files }, () => new File(["x"], "a.pdf")),
    dropped: 0,
  };
}

beforeEach(() => {
  listShares.mockReset();
  pathname = "/apartments";
  search = "";
  push.mockClear();
  deleteShare.mockClear();
});
afterEach(cleanup);

describe("PendingSharePrompt", () => {
  it("renders nothing for an empty stash", async () => {
    listShares.mockResolvedValue([]);
    render(<PendingSharePrompt />);
    await Promise.resolve();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers a PDF", async () => {
    listShares.mockResolvedValue([entry("a", 1)]);
    render(<PendingSharePrompt />);
    expect(await screen.findByText("Add the PDF you shared?")).toBeInTheDocument();
  });

  it("offers a link, newest entry only", async () => {
    listShares.mockResolvedValue([entry("a", 0), entry("b", 1)]);
    render(<PendingSharePrompt />);
    expect(await screen.findByText("Add the link you shared?")).toBeInTheDocument();
    expect(screen.queryByText("Add the PDF you shared?")).toBeNull();
  });

  it("Add navigates to the add page and hides", async () => {
    listShares.mockResolvedValue([entry("a", 0)]);
    render(<PendingSharePrompt />);
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    expect(push).toHaveBeenCalledWith("/apartments/new?share=a&confirmed=1");
    expect(screen.queryByRole("status")).toBeNull();
    expect(deleteShare).not.toHaveBeenCalled();
  });

  it("Discard deletes the entry and hides", async () => {
    listShares.mockResolvedValue([entry("a", 0)]);
    render(<PendingSharePrompt />);
    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(deleteShare).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("status")).toBeNull();
  });

  // The negatives below await the read's own promise inside act, so its
  // state update has been applied before asserting absence; the positive
  // control shows the same setup does render when the id differs.
  async function renderAndSettle(stash: SharedItem[]) {
    const read = Promise.resolve(stash);
    listShares.mockReturnValue(read);
    const result = render(<PendingSharePrompt />);
    await act(async () => {
      await read;
    });
    return result;
  }

  it("stays away on the add page handling that share", async () => {
    pathname = "/apartments/new";
    search = "share=a";
    await renderAndSettle([entry("a", 0)]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does show on the add page handling another share (control)", async () => {
    pathname = "/apartments/new";
    search = "share=b";
    await renderAndSettle([entry("a", 0)]);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does not offer a share the add page consumed before navigating away", async () => {
    pathname = "/apartments/new";
    search = "share=a";
    const { rerender } = await renderAndSettle([entry("a", 0)]);
    // The add page created the draft, deleted the entry and replaced to the list.
    const second = Promise.resolve<SharedItem[]>([]);
    listShares.mockReturnValue(second);
    pathname = "/apartments";
    search = "";
    rerender(<PendingSharePrompt />);
    // Never shown on the new page, not even before the second read answers.
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      await second;
    });
    expect(listShares).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
