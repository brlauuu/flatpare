import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithHouseholdData } from "@/components/household-data/__tests__/fake-household-data";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { AccountNameSettings } from "../account-name-settings";

type Reply = { status: number; body: unknown };
let getReply: Reply;
let putReply: Reply;
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
  const r = init?.method === "PUT" ? putReply : getReply;
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
});

beforeEach(() => {
  refresh.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  getReply = { status: 200, body: { name: "Lena", email: "lena@example.com" } };
  putReply = { status: 200, body: { name: "Lena Muster", displayName: "Lena Muster" } };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountNameSettings", () => {
  it("starts from the stored name", async () => {
    renderWithHouseholdData(<AccountNameSettings />);
    expect(await screen.findByDisplayValue("Lena")).toBeInTheDocument();
  });

  it("says the email is shown while no name is set", async () => {
    getReply = { status: 200, body: { name: null, email: "lena@example.com" } };
    renderWithHouseholdData(<AccountNameSettings />);
    expect(await screen.findByText(/lena@example\.com/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveValue("");
  });

  it("saves, then refreshes the page and the household data so the new name shows everywhere", async () => {
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<AccountNameSettings />);
    const field = await screen.findByDisplayValue("Lena");
    await user.clear(field);
    await user.type(field, "Lena Muster");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(put[0]).toBe("/api/account/name");
    expect(JSON.parse(put[1]!.body as string)).toEqual({ name: "Lena Muster" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(value.reload).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message when the name is refused, and refreshes nothing", async () => {
    putReply = { status: 400, body: { error: "Name can be at most 60 characters." } };
    const user = userEvent.setup();
    const { value } = renderWithHouseholdData(<AccountNameSettings />);
    await screen.findByDisplayValue("Lena");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Name can be at most 60 characters.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(value.reload).not.toHaveBeenCalled();
  });

  it("says so when the stored name cannot be loaded", async () => {
    getReply = { status: 500, body: { error: "Internal error" } };
    renderWithHouseholdData(<AccountNameSettings />);
    expect(await screen.findByText(/couldn't load your name/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled());
  });
});
