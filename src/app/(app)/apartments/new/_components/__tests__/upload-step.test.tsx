import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadStep } from "../upload-step";

afterEach(() => cleanup());

describe("UploadStep", () => {
  it("clicks the hidden file input when 'Choose files' is clicked", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(
      <UploadStep onFiles={onFiles} onManualEntry={() => {}} error={null} />
    );
    const input = document.getElementById("pdf-file-input") as HTMLInputElement;
    const inputClick = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: /Choose files/i }));
    expect(inputClick).toHaveBeenCalled();
  });

  it("invokes onFiles when a PDF is selected through the file input", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    render(
      <UploadStep onFiles={onFiles} onManualEntry={() => {}} error={null} />
    );
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(["%PDF-"], "x.pdf", { type: "application/pdf" });
    await user.upload(input, file);
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it("invokes onFiles via drop event", () => {
    const onFiles = vi.fn();
    render(
      <UploadStep onFiles={onFiles} onManualEntry={() => {}} error={null} />
    );
    const dropZone = screen
      .getByText(/Drag and drop one or more PDFs/i)
      .closest("div")!;
    const file = new File(["%PDF-"], "x.pdf", { type: "application/pdf" });
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file], types: ["Files"] },
    });
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it("toggles the drag-over highlight on dragOver / dragLeave", () => {
    render(
      <UploadStep onFiles={() => {}} onManualEntry={() => {}} error={null} />
    );
    const dropZone = screen
      .getByText(/Drag and drop one or more PDFs/i)
      .closest("div") as HTMLDivElement;
    expect(dropZone.className).toContain("border-muted-foreground/25");
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain("border-primary");
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).toContain("border-muted-foreground/25");
  });

  it("calls onManualEntry when the link button is clicked", async () => {
    const user = userEvent.setup();
    const onManualEntry = vi.fn();
    render(
      <UploadStep
        onFiles={() => {}}
        onManualEntry={onManualEntry}
        error={null}
      />
    );
    await user.click(
      screen.getByRole("button", { name: /Or add manually without PDF/i })
    );
    expect(onManualEntry).toHaveBeenCalled();
  });

  it("renders the error display when error is set", () => {
    render(
      <UploadStep
        onFiles={() => {}}
        onManualEntry={() => {}}
        error={{ headline: "Boom" }}
      />
    );
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });
});
