import { describe, it, expect } from "vitest";
import { pdfFileName } from "../pdf-file-name";

const ID = "11111111-1111-4111-8111-111111111111";

describe("pdfFileName", () => {
  // Version 1 must keep the unversioned name: every row written before
  // rotation existed already points at it.
  it("keeps the unversioned name for version 1", () => {
    expect(pdfFileName(ID)).toBe(`${ID}.pdf.enc`);
    expect(pdfFileName(ID, 1)).toBe(`${ID}.pdf.enc`);
  });
  it("versions the name from 2 on, so the old file survives until the rotation commits", () => {
    expect(pdfFileName(ID, 2)).toBe(`${ID}.k2.pdf.enc`);
    expect(pdfFileName(ID, 10)).toBe(`${ID}.k10.pdf.enc`);
  });
});
