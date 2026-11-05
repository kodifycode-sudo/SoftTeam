import { TIPOS_INTERFAZ } from "@/domain/cuentas/limites";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { listarAseguradorasEmpresa } from "@/server/modules/configuracion/aseguradoras";

/**
 * GET /portal/aseguradoras/exportar: las aseguradoras de la empresa activa
 * (las mismas de la pantalla) con el estado de sus interfaces, en CSV.
 */
export async function GET() {
  const contexto = await requerirConfiguracionEmpresa();
  const todas = await listarAseguradorasEmpresa(await obtenerDb(), contexto.empresaId);
  const deLaEmpresa = todas.filter(
    (a) => a.trabaja || TIPOS_INTERFAZ.some((tipo) => a.interfaces[tipo].vigente),
  );
  return respuestaCsv("aseguradoras", deLaEmpresa, [
    { titulo: "Nombre", valor: (f) => f.nombre },
    { titulo: "Abreviatura", valor: (f) => f.abreviatura },
    { titulo: "Código SSN", valor: (f) => f.codigoLegal },
    { titulo: "Trabaja con ella", valor: (f) => f.trabaja },
    { titulo: "Interfaz con Prodigal", valor: (f) => f.interfaces.prodigal.vigente },
    { titulo: "Prodigal: baja desde", valor: (f) => f.interfaces.prodigal.bajaDesde },
    { titulo: "Interfaz con CotiWeb", valor: (f) => f.interfaces.cotiweb.vigente },
    { titulo: "CotiWeb: baja desde", valor: (f) => f.interfaces.cotiweb.bajaDesde },
    { titulo: "Discontinuada", valor: (f) => f.discontinuada },
  ]);
}
