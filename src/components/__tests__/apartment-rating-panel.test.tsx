import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OtherRatingPanel } from "../apartment-rating-panel";

afterEach(cleanup);

const SCORES = { kitchen: 4, balconies: 3, location: 5, floorplan: 4, overallFeeling: 4 };

describe("OtherRatingPanel", () => {
  // One glyph for the possessive, as in the compare table (#205).
  it("titles the card with a straight apostrophe", () => {
    render(<OtherRatingPanel rating={{ userId: "u1", userName: "Bob", comment: "", ...SCORES }} />);
    expect(screen.getByText("Bob's Rating")).toBeInTheDocument();
  });

  // Two members without a name used to get two identical "Household member's
  // Rating" cards (#205); the email they are labelled by tells them apart.
  it("tells two members without a name apart by their email", () => {
    render(
      <>
        <OtherRatingPanel rating={{ userId: "u1", userName: "anna@gmail.com", comment: "", ...SCORES }} />
        <OtherRatingPanel rating={{ userId: "u2", userName: "anna@proton.me", comment: "", ...SCORES }} />
      </>
    );
    expect(screen.getByText("anna@gmail.com's Rating")).toBeInTheDocument();
    expect(screen.getByText("anna@proton.me's Rating")).toBeInTheDocument();
    expect(screen.queryByText(/Household member/)).not.toBeInTheDocument();
  });
});
