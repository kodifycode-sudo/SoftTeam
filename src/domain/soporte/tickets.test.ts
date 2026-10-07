import { describe, expect, it } from "vitest";
import { usaTicket } from "./tickets";

describe("usaTicket", () => {
  it("el soporte técnico de los productos usa ticket", () => {
    for (const producto of ["prodigal", "cotiweb", "bienseguro", "boletin", "otro"]) {
      expect(usaTicket(producto)).toBe(true);
    }
  });

  it("las consultas sobre la cuenta, licencias y pagos no", () => {
    expect(usaTicket("stlic")).toBe(false);
  });
});
