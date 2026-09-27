import { describe, expect, it } from "vitest";
import { type Alcance, abarca, abarcaOficina, alcanceDe, TODA_LA_EMPRESA } from "./alcance";

const canal1: Alcance = { tipo: "canal", canalId: "c1" };
const oficina1: Alcance = { tipo: "oficina", canalId: "c1", oficinaId: "o1" };
const oficina2: Alcance = { tipo: "oficina", canalId: "c1", oficinaId: "o2" };
const oficina3: Alcance = { tipo: "oficina", canalId: "c2", oficinaId: "o3" };

describe("alcance de los administradores", () => {
  it("se deduce del canal y la oficina del colaborador", () => {
    expect(alcanceDe({ canalId: null, oficinaId: null })).toEqual(TODA_LA_EMPRESA);
    expect(alcanceDe({ canalId: "c1", oficinaId: null })).toEqual(canal1);
    expect(alcanceDe({ canalId: "c1", oficinaId: "o1" })).toEqual(oficina1);
  });

  it("toda la empresa abarca todo", () => {
    for (const destino of [TODA_LA_EMPRESA, canal1, oficina1, oficina3]) {
      expect(abarca(TODA_LA_EMPRESA, destino)).toBe(true);
    }
  });

  it("un canal abarca sus oficinas, no la empresa ni otros canales", () => {
    expect(abarca(canal1, canal1)).toBe(true);
    expect(abarca(canal1, oficina1)).toBe(true);
    expect(abarca(canal1, oficina3)).toBe(false);
    expect(abarca(canal1, TODA_LA_EMPRESA)).toBe(false);
  });

  it("una oficina solo se abarca a sí misma", () => {
    expect(abarca(oficina1, oficina1)).toBe(true);
    expect(abarca(oficina1, oficina2)).toBe(false);
    expect(abarca(oficina1, canal1)).toBe(false);
  });

  it("lo que es de toda la empresa solo lo ve quien administra toda la empresa", () => {
    expect(abarcaOficina(TODA_LA_EMPRESA, null)).toBe(true);
    expect(abarcaOficina(canal1, null)).toBe(false);
    expect(abarcaOficina(canal1, { id: "o2", canalId: "c1" })).toBe(true);
    expect(abarcaOficina(oficina1, { id: "o2", canalId: "c1" })).toBe(false);
    expect(abarcaOficina(oficina1, { id: "o1", canalId: "c1" })).toBe(true);
  });
});
