import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecoveryKit } from "../recovery-kit";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CODE = "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY";

describe("RecoveryKit", () => {
  it("shows the code and keeps Continue disabled until the acknowledgement is ticked", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<RecoveryKit code={CODE} onContinue={onContinue} />);

    expect(screen.getByText(CODE)).toBeInTheDocument();
    const cont = screen.getByRole("button", { name: /continue/i });
    expect(cont).toBeDisabled();
    await user.click(cont);
    expect(onContinue).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", {
        name: /I understand that if I lose both my passphrase and this recovery kit/i,
      })
    );
    expect(cont).toBeEnabled();
    await user.click(cont);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("copies and prints", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    // navigator.clipboard is a prototype getter in jsdom; define an own
    // property over it rather than spreading navigator (which yields {}).
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<RecoveryKit code={CODE} onContinue={() => {}} />);

    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(CODE);
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /print/i }));
    expect(print).toHaveBeenCalled();
  });
});
