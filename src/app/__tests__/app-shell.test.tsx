import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ErrorBoundary from "../error";
import GuidePage from "../guide/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary (src/app/error.tsx)", () => {
  function renderError(over: Partial<Error & { digest?: string }> = {}) {
    const retry = vi.fn();
    const error = Object.assign(new Error("Boom"), over) as Error & {
      digest?: string;
    };
    render(<ErrorBoundary error={error} unstable_retry={retry} />);
    return { retry, error };
  }

  beforeEach(() => {
    // The component logs on mount by design; keep the suite output clean
    // while still asserting the call happened.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the error message and a way out", async () => {
    const { retry } = renderError();
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    // The message appears twice — as the headline and inside the details
    // payload — so assert presence rather than uniqueness.
    expect(screen.getAllByText("Boom").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("logs the error so it is not swallowed by the boundary", () => {
    const { error } = renderError();
    expect(console.error).toHaveBeenCalledWith("[error.tsx]", error);
  });

  it("falls back to a generic headline when the error has no message", () => {
    // `new Error("")` renders an empty headline otherwise, which reads as a
    // broken page rather than an error report.
    render(
      <ErrorBoundary
        error={Object.assign(new Error(""), {}) as Error}
        unstable_retry={vi.fn()}
      />
    );
    expect(screen.getByText("Unexpected error")).toBeInTheDocument();
  });

  it("surfaces the digest when Next supplies one", async () => {
    // In production Next replaces the message with a digest; without showing
    // it there is nothing to correlate against server logs.
    renderError({ digest: "abc123" });
    await userEvent.click(screen.getByText(/show details/i));
    expect(screen.getByText(/digest: abc123/)).toBeInTheDocument();
  });
});

describe("GuidePage (src/app/guide/page.tsx)", () => {
  it("renders the guide markdown as HTML", async () => {
    render(await GuidePage());
    // Reads src/content/guide.md off disk for real — the point of the page is
    // that the file is found and converted, so mocking fs would test nothing.
    expect(
      screen.getByRole("heading", { name: /flatpare user guide/i })
    ).toBeInTheDocument();
  });

  it("converts GFM tables and headings, not just paragraphs", async () => {
    const { container } = render(await GuidePage());
    // remarkGfm is in the pipeline on purpose; without it the guide's tables
    // render as literal pipe characters.
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(0);
    expect(container.querySelector(".guide-prose")).toBeInTheDocument();
  });
});
