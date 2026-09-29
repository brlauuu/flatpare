import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithHouseholdData,
  makeApartmentView,
} from "@/components/household-data/__tests__/fake-household-data";

const push = vi.fn();
let currentParamsId = "a1";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: currentParamsId }),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/components/apartment-location-map", () => ({
  ApartmentLocationMap: ({ label }: { label: string }) => <div data-testid="pin-map">{label}</div>,
}));
vi.mock("@/components/household-data/pdf-files", () => ({
  encryptAndUploadPdf: vi.fn(),
  downloadPdf: vi.fn(),
}));
vi.mock("@/components/household-data/process-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/household-data/process-client")>()),
  parsePdf: vi.fn(),
}));

import ApartmentDetailPage from "../page";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

const A1 = makeApartmentView({
  id: "a1",
  name: "Sonnenweg 3",
  address: "Sonnenweg 3, 8001 Zurich",
  sizeM2: 60,
  numRooms: 2.5,
  numBathrooms: 1,
  numBalconies: 1,
  hasWashingMachine: null,
  rentChf: 2200,
  summary: "Quiet 2.5-room flat in a leafy district near transit.",
  availableFrom: "2026-05-01",
  userEditedFields: ["summary"],
});

function setup() {
  currentParamsId = "a1";
  const rendered = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [A1] });
  // Apply the mutator to the fixture and return the resulting view, the way
  // the real store does.
  vi.mocked(rendered.value.updateApartment).mockImplementation(async (id, mutate) =>
    makeApartmentView({ ...mutate(A1), id })
  );
  return rendered;
}

describe("Apartment detail edit flow", () => {
  it("opens the edit form, saves through updateApartment and records the changed fields", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    expect(screen.getByRole("heading", { name: "Sonnenweg 3" })).toBeInTheDocument();
    expect(screen.getByText(/CHF 2,200/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    const rentInput = screen.getByLabelText(/Rent/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Sonnenweg 3");
    expect(rentInput.value).toBe("2200");

    await user.clear(nameInput);
    await user.type(nameInput, "Sonnenweg 3b");
    await user.clear(rentInput);
    await user.type(rentInput, "2400");
    await user.click(screen.getByRole("button", { name: /^Yes$/ }));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    const [id, mutate] = vi.mocked(value.updateApartment).mock.calls[0];
    expect(id).toBe("a1");
    const next = mutate(A1);
    expect(next.name).toBe("Sonnenweg 3b");
    expect(next.rentChf).toBe(2400);
    expect(next.hasWashingMachine).toBe(true);
    expect(next.userEditedFields.sort()).toEqual(["hasWashingMachine", "name", "rentChf", "summary"]);
    // Edit form closed again.
    await waitFor(() => expect(screen.queryByLabelText(/Rent/i)).toBeNull());
  }, 10000);

  it("Cancel discards edits and returns to read-only view", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Something else");
    const cancels = screen.getAllByRole("button", { name: /^Cancel$/ });
    await user.click(cancels.find((b) => !(b as HTMLButtonElement).disabled)!);
    expect(value.updateApartment).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Sonnenweg 3" })).toBeInTheDocument();
  });

  it("disables Delete while editing and re-enables it after Cancel", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole("button", { name: /Delete/i })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    expect(screen.getByRole("button", { name: /Delete/i })).toBeDisabled();
    const cancels = screen.getAllByRole("button", { name: /^Cancel$/ });
    await user.click(cancels.find((b) => !(b as HTMLButtonElement).disabled)!);
    expect(screen.getByRole("button", { name: /Delete/i })).not.toBeDisabled();
  });

  it("requires a name", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.clear(screen.getByLabelText(/Name/i));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(value.updateApartment).not.toHaveBeenCalled();
  });

  it("shows an error and stays in edit mode when the store rejects the save", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    vi.mocked(value.updateApartment).mockRejectedValue(new Error("Stale version"));
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText(/Couldn't save changes/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rent/i)).toBeInTheDocument();
  });

  it("displays availableFrom in Swiss format and the summary card", () => {
    setup();
    expect(screen.getByText(/01\.05\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/Quiet 2.5-room flat in a leafy district/)).toBeInTheDocument();
  });

  it("round-trips summary and availableFrom through the edit form", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    const summaryField = screen.getByLabelText(/Summary/i) as HTMLTextAreaElement;
    expect(summaryField.value).toBe("Quiet 2.5-room flat in a leafy district near transit.");
    await user.clear(summaryField);
    await user.type(summaryField, "Updated description after edit.");
    const dateInput = screen.getByLabelText(/Available from/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-05-01");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-07-15");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    const next = vi.mocked(value.updateApartment).mock.calls[0][1](A1);
    expect(next.summary).toBe("Updated description after edit.");
    expect(next.availableFrom).toBe("2026-07-15");
  }, 10000);
});
