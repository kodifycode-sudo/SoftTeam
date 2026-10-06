import { describe, expect, it } from "vitest";
import type { Fecha } from "@/domain/fecha";
import { pendientesDeAtencion } from "./atencion";

const HOY = "2026-10-06" as Fecha;
const fecha = (f: string) => f as Fecha;
const UMBRALES = { diasAviso: 15, porcentajeBajo: 20 };

describe("pendientesDeAtencion", () => {
  it("avisa los paquetes que vencen pronto y no se renuevan solos, el más cercano primero", () => {
    const { vencen } = pendientesDeAtencion(
      HOY,
      [
        { paquete: "Prodigal Full", hasta: fecha("2026-10-20"), renuevaSolo: false },
        { paquete: "CotiWeb Pro", hasta: fecha("2026-10-08"), renuevaSolo: false },
        { paquete: "BienSeguro Base", hasta: fecha("2026-10-08"), renuevaSolo: true },
        { paquete: "Lejano", hasta: fecha("2026-12-01"), renuevaSolo: false },
        { paquete: "Saldo", hasta: null, renuevaSolo: false },
      ],
      [],
      UMBRALES,
    );
    expect(vencen).toEqual([
      { paquete: "CotiWeb Pro", dias: 2 },
      { paquete: "Prodigal Full", dias: 14 },
    ]);
  });

  it("el límite es inclusivo y sigue al parámetro", () => {
    const vencimientos = [
      { paquete: "Hoy", hasta: HOY, renuevaSolo: false },
      { paquete: "Quince", hasta: fecha("2026-10-21"), renuevaSolo: false },
      { paquete: "Dieciséis", hasta: fecha("2026-10-22"), renuevaSolo: false },
      { paquete: "Ayer", hasta: fecha("2026-10-05"), renuevaSolo: false },
    ];
    const nombres = (diasAviso: number) =>
      pendientesDeAtencion(HOY, vencimientos, [], { ...UMBRALES, diasAviso }).vencen.map(
        (v) => v.paquete,
      );
    expect(nombres(15)).toEqual(["Hoy", "Quince"]);
    expect(nombres(30)).toEqual(["Hoy", "Quince", "Dieciséis"]);
  });

  it("avisa los saldos bajos y agotados como las alertas, los agotados primero", () => {
    const { saldosBajos } = pendientesDeAtencion(
      HOY,
      [],
      [
        { nombre: "Cotizaciones", total: 2000, disponible: 400 },
        { nombre: "Notificaciones", total: 3000, disponible: 601 },
        { nombre: "Tickets", total: 10, disponible: 0 },
        { nombre: "Sin total", total: 0, disponible: 0 },
      ],
      UMBRALES,
    );
    expect(saldosBajos).toEqual([
      { nombre: "Tickets", total: 10, disponible: 0, agotado: true },
      { nombre: "Cotizaciones", total: 2000, disponible: 400, agotado: false },
    ]);
  });
});
