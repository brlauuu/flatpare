import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ApartmentFormFields,
  WashingMachineToggle,
  emptyApartmentForm,
  formFromExtracted,
  formFromApartment,
  formToPayload,
} from "../apartment-form-fields";

afterEach(() => cleanup());

describe("ApartmentFormFields — onChange wiring", () => {
  const fieldsThatCallOnChange: Array<[keyof typeof emptyApartmentForm, string, string]> = [
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
    const form = formFromExtracted(
      {
        name: "Pretty Place",
        address: "Sonnenweg 3",
        sizeM2: 60,
        numRooms: 2.5,
        numBathrooms: 1,
        numBalconies: null,
        hasWashingMachine: true,
        rentChf: 2400,
        listingUrl: null,
      },
      "https://blob.example/x.pdf"
    );
    expect(form.name).toBe("Pretty Place");
    expect(form.rentChf).toBe("2400");
    expect(form.sizeM2).toBe("60");
    expect(form.numBalconies).toBe("");
    expect(form.hasWashingMachine).toBe(true);
    expect(form.pdfUrl).toBe("https://blob.example/x.pdf");
    expect(form.listingUrl).toBe("");
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
      pdfUrl: null,
      listingUrl: null,
      summary: "Nice flat",
      availableFrom: "2026-05-01",
    });
    expect(form.summary).toBe("Nice flat");
    expect(form.availableFrom).toBe("2026-05-01");
    expect(form.rentChf).toBe("");
  });

  it("formToPayload coerces strings back to numbers (or null) and preserves summary", () => {
    const payload = formToPayload({
      ...emptyApartmentForm,
      name: "X",
      rentChf: "2400",
      sizeM2: "",
      numRooms: "2.5",
      numBathrooms: "1",
      summary: "keeps content",
    });
    expect(payload.rentChf).toBe(2400);
    expect(payload.sizeM2).toBeNull();
    expect(payload.numRooms).toBe(2.5);
    expect(payload.numBathrooms).toBe(1);
    expect(payload.summary).toBe("keeps content");
  });

  it("formToPayload returns null summary when the field is the empty string", () => {
    const payload = formToPayload({ ...emptyApartmentForm, summary: "" });
    expect(payload.summary).toBeNull();
  });

  it("formToPayload coerces empty optional strings to null (address, listingUrl, availableFrom)", () => {
    const payload = formToPayload(emptyApartmentForm);
    expect(payload.address).toBeNull();
    expect(payload.listingUrl).toBeNull();
    expect(payload.availableFrom).toBeNull();
    expect(payload.pdfUrl).toBeNull();
  });
});
