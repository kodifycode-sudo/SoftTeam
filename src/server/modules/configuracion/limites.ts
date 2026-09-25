import { and, eq } from "drizzle-orm";
import {
  interfazVigente,
  PRODUCTOS_CON_ACCESO,
  type ProductoAcceso,
  RECURSO_INTERFACES,
  RECURSO_USUARIOS,
  TIPOS_INTERFAZ,
  type TipoInterfaz,
  type Uso,
} from "@/domain/cuentas/limites";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { licenciaDeEmpresa } from "../licencias/licencia-empresa";

export const NOMBRE_PRODUCTO: Record<ProductoAcceso, string> = {
  prodigal: "Prodigal",
  cotiweb: "CotiWeb",
  bienseguro: "BienSeguro",
  boletin: "Boletín",
};

export const COLUMNA_ACCESO = {
  prodigal: "accesoProdigal",
  cotiweb: "accesoCotiweb",
  bienseguro: "accesoBienseguro",
  boletin: "accesoBoletin",
} as const satisfies Record<ProductoAcceso, keyof typeof t.colaboradores.$inferSelect>;

export interface UsoProducto extends Uso {
  producto: ProductoAcceso;
  licenciado: boolean;
}

export interface UsoInterfaz extends Uso {
  tipo: TipoInterfaz;
  licenciado: boolean;
}

export interface UsoDeLimites {
  usuarios: Record<ProductoAcceso, UsoProducto>;
  interfaces: Record<TipoInterfaz, UsoInterfaz>;
  /** Funciones habilitadas por la licencia ("prodigal.institorio"…). */
  funciones: Set<string>;
}

/**
 * Lo licenciado hoy contra lo que está en uso: usuarios activos con acceso a
 * cada producto e interfaces vigentes. Dentro de una transacción que bloquea
 * la empresa, sirve para validar una activación sin carreras.
 */
export async function usoDeLimites(
  db: Ejecutor,
  empresaId: string,
  hoy: Fecha = hoyArgentina(),
): Promise<UsoDeLimites> {
  const [licencia, conAcceso, interfaces] = await Promise.all([
    licenciaDeEmpresa(db, empresaId, hoy),
    contarAccesos(db, empresaId),
    db
      .select({
        prodigal: t.empresaAseguradoras.interfazProdigal,
        prodigalBaja: t.empresaAseguradoras.interfazProdigalBajaDesde,
        cotiweb: t.empresaAseguradoras.interfazCotiweb,
        cotiwebBaja: t.empresaAseguradoras.interfazCotiwebBajaDesde,
      })
      .from(t.empresaAseguradoras)
      .where(eq(t.empresaAseguradoras.empresaId, empresaId)),
  ]);

  const totales = new Map<string, number>();
  const productos = new Set<string>();
  const funciones = new Set<string>();
  for (const p of licencia.productos) {
    for (const i of p.items) {
      totales.set(i.recursoId, i.total);
      if (i.total > 0) productos.add(p.productoId);
      if (i.clase === "FUNCION" && i.total > 0) funciones.add(i.recursoId);
    }
  }

  const usuarios = Object.fromEntries(
    PRODUCTOS_CON_ACCESO.map((producto) => {
      const recurso = RECURSO_USUARIOS[producto];
      return [
        producto,
        {
          producto,
          licenciado: productos.has(producto),
          licenciados: recurso ? (totales.get(recurso) ?? 0) : null,
          enUso: conAcceso[producto],
        },
      ];
    }),
  ) as Record<ProductoAcceso, UsoProducto>;

  const vigentes = { prodigal: 0, cotiweb: 0 };
  for (const i of interfaces) {
    if (interfazVigente(i.prodigal, i.prodigalBaja as Fecha | null, hoy)) vigentes.prodigal++;
    if (interfazVigente(i.cotiweb, i.cotiwebBaja as Fecha | null, hoy)) vigentes.cotiweb++;
  }
  const interfacesUso = Object.fromEntries(
    TIPOS_INTERFAZ.map((tipo) => {
      const licenciados = totales.get(RECURSO_INTERFACES[tipo]) ?? 0;
      return [tipo, { tipo, licenciado: licenciados > 0, licenciados, enUso: vigentes[tipo] }];
    }),
  ) as Record<TipoInterfaz, UsoInterfaz>;

  return { usuarios, interfaces: interfacesUso, funciones };
}

async function contarAccesos(
  db: Ejecutor,
  empresaId: string,
): Promise<Record<ProductoAcceso, number>> {
  const filas = await db
    .select({
      prodigal: t.colaboradores.accesoProdigal,
      cotiweb: t.colaboradores.accesoCotiweb,
      bienseguro: t.colaboradores.accesoBienseguro,
      boletin: t.colaboradores.accesoBoletin,
    })
    .from(t.colaboradores)
    .where(and(eq(t.colaboradores.empresaId, empresaId), eq(t.colaboradores.activo, true)));
  const total = { prodigal: 0, cotiweb: 0, bienseguro: 0, boletin: 0 };
  for (const f of filas) {
    for (const p of PRODUCTOS_CON_ACCESO) if (f[p]) total[p]++;
  }
  return total;
}
