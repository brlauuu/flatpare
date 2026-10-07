import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ApartmentCard, LocationCard } from "../map-card";

afterEach(cleanup);

const apt = { id: "a1", label: "BS-04", name: "Bachletten quiet street", latitude: 0, longitude: 0, rentChf: 3100, sizeM2: 104, numRooms: 4.5, avgOverall: 4.84 };

describe("ApartmentCard", () => {
  it("shows code, price, area, rooms, rating and name, and opens the apartment", () => {
    render(<ApartmentCard apartment={apt} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/apartments/a1");
    expect(link).toHaveTextContent("BS-04");
    expect(link).toHaveTextContent(/CHF 3.100/);
    expect(link).toHaveTextContent("104 m²");
    expect(link).toHaveTextContent("4.5 rooms");
    expect(link).toHaveTextContent("★ 4.8");
    expect(link).toHaveTextContent("Bachletten quiet street");
  });

  it("omits unknown values and says when nobody has rated", () => {
    render(<ApartmentCard apartment={{ ...apt, rentChf: null, sizeM2: null, numRooms: null, avgOverall: null }} />);
    const link = screen.getByRole("link");
    expect(link).not.toHaveTextContent("CHF");
    expect(link).not.toHaveTextContent("m²");
    expect(link).not.toHaveTextContent("room");
    expect(link).toHaveTextContent("Not rated");
  });
});

describe("LocationCard", () => {
  it("shows the label and address and is not a link", () => {
    render(<LocationCard location={{ id: "l1", label: "Office", address: "Fabrikstrasse 2", latitude: 0, longitude: 0 }} />);
    expect(screen.getByText("Office")).toBeInTheDocument();
    expect(screen.getByText("Fabrikstrasse 2")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
