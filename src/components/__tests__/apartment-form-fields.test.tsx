import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ApartmentFormFields,
  WashingMachineToggle,
  emptyApartmentForm,
  formFromExtracted,
  formFromApartment,
  formToFields,
  apartmentFromForm,
} from "../apartment-form-fields";

afterEach(() => cleanup());

describe("ApartmentFormFields — onChange wiring", () => {
  const fieldsThatCallOnChange: Array<[keyof typeof emptyApartmentForm, RegExp, string]> = [
    ["address", /^Address$/, "Bahnhofstrasse 1"],
    ["rentChf", /^Rent/, "2500"],
    ["sizeM2", /^Size/, "75"],
    ["numRooms", /^Rooms$/, "3.5"],
    ["numBathrooms", /^Baths$/, "2"],
    ["numBalconies", /^Balconies$/, "1"],
    ["listingUrl", /^Listing URL$/, "https://example.com"],
  ];

  for (const [field, labelRegex, value] of fieldsThatCallOnChange) {
    it(`forwards changes on the ${String(field)} input`, () => {
      const onChange = vi.fn();
      render(
        <ApartmentFormFields
          form={emptyApartmentForm}
          onChange={onChange}
          onWashingMachineChange={() => {}}
        />
      );
      const input = screen.getByLabelText(labelRegex) as HTMLInputElement;
      fireEvent.change(input, { target: { value } });
      expect(onChange).toHaveBeenCalledWith(field, value);
    });
  }

  it("forwards changes on the Available from date input", () => {
    const onChange = vi.fn();
    render(
      <ApartmentFormFields
        form={emptyApartmentForm}
        onChange={onChange}
        onWashingMachineChange={() => {}}
      />
    );
    const date = screen.getByLabelText(/Available from/i) as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2026-07-15" } });
    expect(onChange).toHaveBeenCalledWith("availableFrom", "2026-07-15");
  });

  it("uses idPrefix to disambiguate inputs across multiple cards", () => {
    render(
      <>
        <ApartmentFormFields
          form={emptyApartmentForm}
          onChange={() => {}}
          onWashingMachineChange={() => {}}
          idPrefix="alpha"
        />
        <ApartmentFormFields
          form={emptyApartmentForm}
          onChange={() => {}}
          onWashingMachineChange={() => {}}
          idPrefix="beta"
        />
      </>
    );
    expect(document.getElementById("alpha-name")).not.toBeNull();
    expect(document.getElementById("beta-name")).not.toBeNull();
  });
});

describe("WashingMachineToggle", () => {
  it("calls onChange with true → false → null as buttons are clicked", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WashingMachineToggle value={null} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Yes$/ }));
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<WashingMachineToggle value={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^No$/ }));
    expect(onChange).toHaveBeenLastCalledWith(false);

    rerender(<WashingMachineToggle value={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Unknown/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("marks the active option with aria-pressed", () => {
    render(<WashingMachineToggle value={true} onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /^Yes$/ })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /^No$/ })
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("apartment-form-fields helpers", () => {
  it("formFromExtracted maps AI extraction to form-shape strings, defaulting null → ''", () => {
    const form = formFromExtracted({
      name: "Pretty Place",
      address: "Sonnenweg 3",
      sizeM2: 60,
      numRooms: 2.5,
      numBathrooms: 1,
      numBalconies: null,
      hasWashingMachine: true,
      rentChf: 2400,
      listingUrl: null,
    });
    expect(form.name).toBe("Pretty Place");
    expect(form.rentChf).toBe("2400");
    expect(form.sizeM2).toBe("60");
    expect(form.numBalconies).toBe("");
    expect(form.hasWashingMachine).toBe(true);
    expect(form.listingUrl).toBe("");
    expect(form.rawExtractedData).toEqual(expect.objectContaining({ name: "Pretty Place" }));
  });

  it("formFromApartment maps a stored apartment back into form fields", () => {
    const form = formFromApartment({
      name: "X",
      address: null,
      sizeM2: null,
      numRooms: null,
      numBathrooms: null,
      numBalconies: null,
      hasWashingMachine: null,
      rentChf: null,
      listingUrl: null,
      summary: "Nice flat",
      availableFrom: "2026-05-01",
    });
    expect(form.summary).toBe("Nice flat");
    expect(form.availableFrom).toBe("2026-05-01");
    expect(form.rentChf).toBe("");
  });

  it("formToFields coerces strings back to numbers (or null) and preserves summary", () => {
    const fields = formToFields({
      ...emptyApartmentForm,
      name: "X",
      rentChf: "2400",
      sizeM2: "",
      numRooms: "2.5",
      numBathrooms: "1",
      summary: "keeps content",
    });
    expect(fields.rentChf).toBe(2400);
    expect(fields.sizeM2).toBeNull();
    expect(fields.numRooms).toBe(2.5);
    expect(fields.numBathrooms).toBe(1);
    expect(fields.summary).toBe("keeps content");
  });

  it("formToFields coerces empty optional strings to null", () => {
    const fields = formToFields(emptyApartmentForm);
    expect(fields.summary).toBeNull();
    expect(fields.address).toBeNull();
    expect(fields.listingUrl).toBeNull();
    expect(fields.availableFrom).toBeNull();
    expect("pdf" in fields).toBe(false);
    expect("rawExtractedData" in fields).toBe(false);
  });

  it("apartmentFromForm builds a full Apartment with defaults, raw data and the pdf", () => {
    const pdf = { path: "/api/uploads/households/7/x.pdf.enc", iv: "AAAA" };
    const apt = apartmentFromForm(
      { ...emptyApartmentForm, name: "X", rentChf: "1000", rawExtractedData: { name: "X" } },
      pdf
    );
    expect(apt.name).toBe("X");
    expect(apt.rentChf).toBe(1000);
    expect(apt.pdf).toEqual(pdf);
    expect(apt.rawExtractedData).toEqual({ name: "X" });
    expect(apt.userEditedFields).toEqual([]);
    expect(apt.distances).toEqual({});
    expect(apt.shortCode).toBeNull();
    expect(apt.listingGone).toBe(false);
  });
});

// #427: the rent's currency.
describe("the rent's currency", () => {
  it("comes from the extraction, and is francs when it names none", () => {
    expect(formFromExtracted({ rentChf: 1200, rentCurrency: "EUR" }).rentCurrency).toBe("EUR");
    expect(formFromExtracted({ rentChf: 1200 }).rentCurrency).toBe("CHF");
  });

  it("is saved with a rent and dropped without one", () => {
    expect(formToFields({ ...emptyApartmentForm, rentChf: "1200", rentCurrency: "EUR" })).toMatchObject({
      rentChf: 1200,
      rentCurrency: "EUR",
    });
    expect(formToFields({ ...emptyApartmentForm, rentCurrency: "EUR" })).toMatchObject({
      rentChf: null,
      rentCurrency: null,
    });
  });

  it("an apartment saved before #427 edits as francs", () => {
    const form = formFromApartment({
      name: "x", address: null, sizeM2: null, numRooms: null, numBathrooms: null, numBalconies: null,
      hasWashingMachine: null, rentChf: 2000, listingUrl: null, summary: null, availableFrom: null,
    });
    expect(form.rentCurrency).toBe("CHF");
  });

  it("offers the usual currencies and the apartment's own, and forwards a choice", async () => {
    const onChange = vi.fn();
    render(
      <ApartmentFormFields
        form={{ ...emptyApartmentForm, rentChf: "900", rentCurrency: "SEK" }}
        onChange={onChange}
        onWashingMachineChange={vi.fn()}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["CHF", "EUR", "USD", "GBP", "SEK"]);
    await user.click(screen.getByRole("option", { name: "EUR" }));
    expect(onChange).toHaveBeenCalledWith("rentCurrency", "EUR");
  });
});
