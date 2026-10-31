import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedbackDialog } from "../feedback-dialog";

// #476: each choice says what the email will carry, and the dialog sends
// what was chosen.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(status = 200) {
  const fetchMock = vi.fn(async () => new Response("{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("FeedbackDialog", () => {
  it("sends the message with the sender's name by default, and says so", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<FeedbackDialog open onOpenChange={() => {}} />);

    expect(screen.getByText(/includes your name and email address/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.click(screen.getByRole("textbox", { name: "Your feedback" }));
    await user.paste("Love the map");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Thank you");
    expect(fetchMock).toHaveBeenCalledWith("/api/feedback", expect.objectContaining({ method: "POST" }));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ message: "Love the map", anonymous: false });
  });

  it("sends anonymously when ticked, and says what that means", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<FeedbackDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByRole("checkbox", { name: "Send anonymously" }));
    expect(screen.getByText(/does not say who you are, and we cannot reply/)).toBeInTheDocument();
    await user.click(screen.getByRole("textbox", { name: "Your feedback" }));
    await user.paste("Quietly");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByRole("status");
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ message: "Quietly", anonymous: true });
  });

  it("says when today's limit is reached and keeps the message", async () => {
    stubFetch(429);
    const user = userEvent.setup();
    render(<FeedbackDialog open onOpenChange={() => {}} />);
    await user.click(screen.getByRole("textbox", { name: "Your feedback" }));
    await user.paste("Later");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("try again tomorrow");
    expect(screen.getByRole("textbox", { name: "Your feedback" })).toHaveValue("Later");
  });
});
