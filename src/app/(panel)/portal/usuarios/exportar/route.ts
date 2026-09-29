import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { columnasUsuarios, usuariosParaExportar } from "@/server/modules/configuracion/exportacion";

/** GET /portal/usuarios/exportar: usuarios de la empresa activa (del alcance), en CSV. */
export async function GET() {
  const contexto = await requerirConfiguracion();
  const usuarios = await usuariosParaExportar(
    await obtenerDb(),
    contexto.empresaId,
    contexto.alcance,
  );
  return respuestaCsv("usuarios", usuarios, columnasUsuarios(contexto.empresaNumero));
}
