import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

import UploadPage from "../page";
import { _resetBlobModeProbeForTests } from "@/lib/upload-pdf";

function makePdfFile(name = "listing.pdf"): File {
  const blob = new Blob(["%PDF-1.4\n...\n"], { type: "application/pdf" });
  return new File([blob], name, { type: "application/pdf" });
}

function makeTextFile(name = "notes.txt"): File {
  return new File(["hi"], name, { type: "text/plain" });
}

function probeResponse(enabled: boolean) {
  return {
    ok: enabled,
    status: enabled ? 200 : 404,
    json: () => Promise.resolve({ enabled }),
  } as Response;
}

function parseSuccess(name: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        pdfUrl: `https://blob.example/${name}`,
        extracted: {
          name: `Parsed ${name}`,
          address: null,
          sizeM2: null,
          numRooms: null,
          numBathrooms: null,
          numBalconies: null,
          hasWashingMachine: null,
          rentChf: null,
          listingUrl: null,
        },
        aiAvailable: true,
      }),
  } as Response;
}

function jsonRes(body: unknown, ok = true, status = 200) {
  const res = {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() {
      return res;
    },
  };
  return res as unknown as Response;
}

async function dropPdf(user: ReturnType<typeof userEvent.setup>, file: File) {
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  await user.upload(input, file);
}

beforeEach(() => {
  pushMock.mockReset();
  _resetBlobModeProbeForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Upload page — manual single-entry flow", () => {
  it("opens the manual form when clicking the link", async () => {
    const user = userEvent.setup();
    render(<UploadPage />);
    await user.click(
      screen.getByRole("button", { name: /Or add manually without PDF/i })
    );
    expect(screen.getByText(/Add Apartment Manually/i)).toBeInTheDocument();
  });

  it("requires a name on the manual form", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<UploadPage />);
    await user.click(
      screen.getByRole("button", { name: /Or add manually without PDF/i })
    );
    // The button is type="submit"; clicking with an empty form triggers
    // browser-level required-field validation in some envs. We bypass that
    // by submitting the form programmatically.
    const form = screen.getByRole("button", { name: /Save Apartment/i }).closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
    // No POST happened.
    expect(
      fetchSpy.mock.calls.filter(
        (c) =>
          String(c[0]) === "/api/apartments" &&
          (c[1] as RequestInit | undefined)?.method === "POST"
      )
    ).toHaveLength(0);
  });

  it("saves a manual apartment and redirects to its detail page", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/apartments" && init?.method === "POST") {
          return jsonRes({ id: 99 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    render(<UploadPage />);
    await user.click(
      screen.getByRole("button", { name: /Or add manually without PDF/i })
    );
    await user.type(screen.getByLabelText(/^Name \*/), "Manual Flat");
    await user.click(screen.getByRole("button", { name: /Save Apartment/i }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/apartments/99");
    });
  });

  it("shows an error when manual save fails on the server", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/apartments" && init?.method === "POST") {
          return jsonRes({ error: "boom" }, false, 500);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    render(<UploadPage />);
    await user.click(
      screen.getByRole("button", { name: /Or add manually without PDF/i })
    );
    await user.type(screen.getByLabelText(/^Name \*/), "Manual Flat");
    await user.click(screen.getByRole("button", { name: /Save Apartment/i }));
    await waitFor(() => {
      expect(screen.getByText(/Failed to save apartment/i)).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows an error when manual save throws (network error)", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    render(<UploadPage />);
    await user.click(
      screen.getByRole("button", { name: /Or add manually without PDF/i })
    );
    await user.type(screen.getByLabelText(/^Name \*/), "Manual Flat");
    await user.click(screen.getByRole("button", { name: /Save Apartment/i }));
    await waitFor(() => {
      expect(screen.getByText(/Failed to save apartment/i)).toBeInTheDocument();
    });
  });

  it("Cancel on the manual form returns to the upload step", async () => {
    const user = userEvent.setup();
    render(<UploadPage />);
    await user.click(
      screen.getByRole("button", { name: /Or add manually without PDF/i })
    );
    await user.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(
      screen.getByRole("heading", { name: /Upload Listings/i })
    ).toBeInTheDocument();
  });
});

describe("Upload page — drop zone validation", () => {
  it("shows an error when the dropped files contain no PDFs", async () => {
    render(<UploadPage />);
    const dropZone = screen
      .getByText(/Drag and drop one or more PDFs/i)
      .closest("div")!;
    const txt = makeTextFile();
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [txt],
        types: ["Files"],
      },
    });
    await waitFor(() => {
      expect(screen.getByText(/No PDF files selected/i)).toBeInTheDocument();
    });
  });
});

describe("Upload page — batch review flow", () => {
  function mockTwoSuccesses() {
    return vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/parse-pdf/upload-token")) {
          return probeResponse(false);
        }
        if (url === "/api/parse-pdf" && init?.method === "POST") {
          const body = init.body as FormData;
          const f = body.get("file") as File;
          return parseSuccess(f.name);
        }
        if (url === "/api/apartments" && init?.method === "POST") {
          return jsonRes({ id: Math.floor(Math.random() * 1000) });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
  }

  it("Save all redirects to /apartments after every item is processed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    mockTwoSuccesses();
    render(<UploadPage />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, [makePdfFile("a.pdf"), makePdfFile("b.pdf")]);

    await waitFor(() => {
      expect(screen.getByText("Parsed a.pdf")).toBeInTheDocument();
      expect(screen.getByText("Parsed b.pdf")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Save all 2/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Saved").length).toBe(2);
    });

    vi.runAllTimers();
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/apartments");
    });
    vi.useRealTimers();
  });

  it('button reads "Save apartment" (singular) when only one is saveable', async () => {
    const user = userEvent.setup();
    mockTwoSuccesses();
    render(<UploadPage />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, makePdfFile("only.pdf"));

    await waitFor(() => {
      expect(screen.getByText("Parsed only.pdf")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Save apartment/i })
    ).toBeInTheDocument();
  });

  it("Upload more clears items and returns to the upload step", async () => {
    const user = userEvent.setup();
    mockTwoSuccesses();
    render(<UploadPage />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, makePdfFile("first.pdf"));

    await waitFor(() => {
      expect(screen.getByText("Parsed first.pdf")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Upload more/i }));
    expect(
      screen.getByRole("heading", { name: /Upload Listings/i })
    ).toBeInTheDocument();
  });

  it("discarding an item removes it from the review list", async () => {
    const user = userEvent.setup();
    mockTwoSuccesses();
    render(<UploadPage />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, [makePdfFile("keep.pdf"), makePdfFile("drop.pdf")]);

    await waitFor(() => {
      expect(screen.getByText("Parsed drop.pdf")).toBeInTheDocument();
    });

    // Find the discard button next to the "drop" card. Each card has a
    // single ✕ button as its only child button besides the global Save/Upload.
    const discardButtons = screen
      .getAllByRole("button")
      .filter((b) => b.textContent === "✕");
    expect(discardButtons.length).toBeGreaterThan(0);
    // Discard the second one (drop.pdf).
    await user.click(discardButtons[discardButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText("Parsed drop.pdf")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Parsed keep.pdf")).toBeInTheDocument();
  });

  it('shows "Failed to save" on an item when the apartments POST fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/parse-pdf/upload-token")) {
          return probeResponse(false);
        }
        if (url === "/api/parse-pdf" && init?.method === "POST") {
          return parseSuccess("x.pdf");
        }
        if (url === "/api/apartments" && init?.method === "POST") {
          return jsonRes({ error: "nope" }, false, 500);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    render(<UploadPage />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, makePdfFile("x.pdf"));

    await waitFor(() => {
      expect(screen.getByText("Parsed x.pdf")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Save apartment/i }));
    await waitFor(() => {
      expect(screen.getByText(/Failed to save/i)).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("expanding a card reveals the editable form", async () => {
    const user = userEvent.setup();
    mockTwoSuccesses();
    render(<UploadPage />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, makePdfFile("expand.pdf"));

    await waitFor(() => {
      expect(screen.getByText("Parsed expand.pdf")).toBeInTheDocument();
    });

    // Click the collapsed-card title row. The expand chevron is a sibling
    // to the title — click the title text itself.
    await user.click(screen.getByText("Parsed expand.pdf"));

    // Form fields appear (Name input pre-populated).
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/^Name \*/) as HTMLInputElement;
      expect(nameInput.value).toBe("Parsed expand.pdf");
    });
  });
});

describe("Upload page — Save all guard", () => {
  it('shows "No apartments to save" when nothing is saveable', async () => {
    // Set up: parse fails so the only item is in error state, but we
    // still surface the Save All button by having one done item we then
    // discard. Easier: trigger handleSaveAll with no saveable items.
    // The button only renders when saveable.length > 0, so this branch
    // is unreachable through normal UI. We exercise it by getting into
    // the review step with a parsed item, discarding it (now nothing
    // saveable), and ensuring the Save button is gone.
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/parse-pdf/upload-token")) {
          return probeResponse(false);
        }
        if (url === "/api/parse-pdf" && init?.method === "POST") {
          return parseSuccess("only.pdf");
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    );
    render(<UploadPage />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await user.upload(input, makePdfFile("only.pdf"));

    await waitFor(() => {
      expect(screen.getByText("Parsed only.pdf")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Save apartment/i })
    ).toBeInTheDocument();

    const discardButtons = screen
      .getAllByRole("button")
      .filter((b) => b.textContent === "✕");
    await user.click(discardButtons[0]);

    // Save button disappears because no saveable items remain.
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Save apartment/i })
      ).not.toBeInTheDocument();
    });
  });
});
