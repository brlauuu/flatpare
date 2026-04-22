import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorDisplay } from "@/components/error-display";

afterEach(cleanup);

describe("<ErrorDisplay />", () => {
  it("renders the headline", () => {
    render(<ErrorDisplay headline="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("does not show a details section when details prop is absent", () => {
    render(<ErrorDisplay headline="Just a headline" />);
    expect(screen.queryByText("Show details")).not.toBeInTheDocument();
  });

  it("renders a collapsible details section when details are provided", () => {
    render(
      <ErrorDisplay
        headline="Couldn't load apartments"
        details={{
          status: 500,
          url: "/api/apartments",
          message: "database down",
          timestamp: "2026-04-22T10:00:00.000Z",
        }}
      />
    );
    expect(screen.getByText("Show details")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("/api/apartments")).toBeInTheDocument();
    expect(screen.getByText("database down")).toBeInTheDocument();
  });

  it("includes the stack when provided", () => {
    render(
      <ErrorDisplay
        headline="Boom"
        details={{
          message: "boom",
          stack: "Error: boom\n  at foo.ts:1",
          timestamp: "2026-04-22T10:00:00.000Z",
        }}
      />
    );
    expect(screen.getByText(/at foo\.ts:1/)).toBeInTheDocument();
  });

  describe("copy button", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
    });

    it("copies a serialized block to the clipboard", async () => {
      const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
      render(
        <ErrorDisplay
          headline="Couldn't load"
          details={{
            status: 500,
            url: "/api/x",
            message: "nope",
            timestamp: "2026-04-22T10:00:00.000Z",
          }}
        />
      );
      const btn = screen.getByRole("button", { name: /copy details/i });
      fireEvent.click(btn);
      expect(writeText).toHaveBeenCalledTimes(1);
      const payload = writeText.mock.calls[0][0] as string;
      expect(payload).toContain("Couldn't load");
      expect(payload).toContain("Status: 500");
      expect(payload).toContain("URL: /api/x");
    });

    it("does not throw when clipboard API is unavailable", () => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockRejectedValue(new Error("denied")),
        },
        configurable: true,
      });
      render(
        <ErrorDisplay
          headline="Boom"
          details={{ timestamp: "2026-04-22T10:00:00.000Z" }}
        />
      );
      const btn = screen.getByRole("button", { name: /copy details/i });
      expect(() => fireEvent.click(btn)).not.toThrow();
    });
  });
});
