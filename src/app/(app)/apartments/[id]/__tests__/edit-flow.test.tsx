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
  rentCurrency: "CHF",
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

    // Pasted, not typed: these tests are about what the form saves, and a key
    // at a time under the loaded parallel run came close to the 10s (#442).
    await user.clear(nameInput);
    await user.paste("Sonnenweg 3b");
    await user.clear(rentInput);
    await user.paste("2400");
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
    await user.paste("Updated description after edit.");
    const dateInput = screen.getByLabelText(/Available from/i) as HTMLInputElement;
    expect(dateInput.value).toBe("2026-05-01");
    await user.clear(dateInput);
    await user.paste("2026-07-15");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    const next = vi.mocked(value.updateApartment).mock.calls[0][1](A1);
    expect(next.summary).toBe("Updated description after edit.");
    expect(next.availableFrom).toBe("2026-07-15");
  }, 10000);
});

// #410: the letters can be changed, to any three no other apartment uses.
describe("Apartment detail code letters", () => {
  const coded = makeApartmentView({ ...A1, numRooms: 3, numBathrooms: null, shortCode: "KXR-3B-?b-W?-8004" });
  const other = makeApartmentView({ id: "b2", name: "Bahnhofstrasse 1", shortCode: "ABC-2B-1b-WN-8000" });

  function setupCoded() {
    currentParamsId = "a1";
    const rendered = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [coded, other] });
    vi.mocked(rendered.value.updateApartment).mockImplementation(async (id, mutate) =>
      makeApartmentView({ ...mutate(coded), id })
    );
    return rendered;
  }

  async function openEdit(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    return screen.getByLabelText("Code letters") as HTMLInputElement;
  }

  it("starts from the apartment's letters and saves new ones, keeping the rest of the code", async () => {
    const user = userEvent.setup();
    const { value } = setupCoded();
    const field = await openEdit(user);
    expect(field.value).toBe("KXR");
    await user.clear(field);
    await user.type(field, "oil");
    expect(field.value).toBe("OIL");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    const [, mutate] = vi.mocked(value.updateApartment).mock.calls[0];
    expect(mutate(coded).shortCode).toBe("OIL-3B-?b-W?-8004");
  });

  it("names the apartment that already uses the letters and keeps Save off", async () => {
    const user = userEvent.setup();
    const { value } = setupCoded();
    const field = await openEdit(user);
    await user.clear(field);
    await user.type(field, "ABC");
    expect(screen.getByText("Bahnhofstrasse 1 already uses ABC. Choose other letters.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    expect(value.updateApartment).not.toHaveBeenCalled();
  });

  it("refuses fewer than three letters", async () => {
    const user = userEvent.setup();
    setupCoded();
    const field = await openEdit(user);
    await user.clear(field);
    await user.type(field, "K1");
    expect(field.value).toBe("K1");
    expect(screen.getByText("Use exactly three letters, A to Z.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });

  it("frees a deleted apartment's letters: only apartments still held count", async () => {
    const user = userEvent.setup();
    currentParamsId = "a1";
    const { value } = renderWithHouseholdData(<ApartmentDetailPage />, { apartments: [coded] });
    vi.mocked(value.updateApartment).mockImplementation(async (id, mutate) => makeApartmentView({ ...mutate(coded), id }));
    const field = await openEdit(user);
    await user.clear(field);
    await user.type(field, "ABC");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
  });

  it("leaves the code to the save when the apartment has none yet", async () => {
    const user = userEvent.setup();
    const { value } = setup();
    const field = await openEdit(user);
    expect(field.value).toBe("");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(value.updateApartment).toHaveBeenCalledTimes(1));
    const [, mutate] = vi.mocked(value.updateApartment).mock.calls[0];
    expect(mutate(A1).shortCode).toBe(A1.shortCode);
  });
});
