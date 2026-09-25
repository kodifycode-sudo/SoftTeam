import { describe, expect, it } from "vitest";
import { diasEntre, fecha, hoy, sumarDias, sumarMeses } from "./fecha";

describe("fecha", () => {
  it("valida formato y existencia", () => {
    expect(fecha("2028-02-29")).toBe("2028-02-29");
    expect(() => fecha("2026-02-29")).toThrow(RangeError);
    expect(() => fecha("25/09/2026")).toThrow(RangeError);
  });

  it("suma meses con tope en fin de mes", () => {
    expect(sumarMeses(fecha("2026-01-31"), 1)).toBe("2026-02-28");
    expect(sumarMeses(fecha("2028-01-31"), 1)).toBe("2028-02-29");
    expect(sumarMeses(fecha("2026-11-15"), 3)).toBe("2027-02-15");
    expect(sumarMeses(fecha("2026-03-31"), -1)).toBe("2026-02-28");
  });

  it("suma días cruzando meses y años", () => {
    expect(sumarDias(fecha("2026-12-31"), 1)).toBe("2027-01-01");
    expect(sumarDias(fecha("2026-03-01"), -1)).toBe("2026-02-28");
  });

  it("cuenta días entre fechas", () => {
    expect(diasEntre(fecha("2026-09-25"), fecha("2026-10-10"))).toBe(15);
    expect(diasEntre(fecha("2026-10-10"), fecha("2026-09-25"))).toBe(-15);
  });

  it("hoy usa la zona horaria de Argentina", () => {
    // 02:00 UTC del 26/09 son las 23:00 del 25/09 en Buenos Aires.
    expect(hoy(new Date("2026-09-26T02:00:00Z"))).toBe("2026-09-25");
  });
});
