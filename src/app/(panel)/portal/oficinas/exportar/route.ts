import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { listarOficinas } from "@/server/modules/cuentas/oficinas";

/** GET /portal/oficinas/exportar: oficinas de la empresa activa (del alcance), en CSV. */
export async function GET() {
  const contexto = await requerirCliente();
  const oficinas = await listarOficinas(await obtenerDb(), contexto.empresaId, contexto.alcance);
  return respuestaCsv("oficinas", oficinas, [
    { titulo: "Canal", valor: (f) => f.canalCodigo },
    { titulo: "Nombre del canal", valor: (f) => f.canalNombre },
    { titulo: "Oficina", valor: (f) => `${f.canalCodigo}-${f.codigo}` },
    { titulo: "Nombre", valor: (f) => f.nombre },
    { titulo: "Teléfono", valor: (f) => f.telefono },
    { titulo: "WhatsApp", valor: (f) => f.whatsapp },
    { titulo: "Domicilio", valor: (f) => f.domicilio },
    { titulo: "Web", valor: (f) => f.redes?.web },
    { titulo: "Facebook", valor: (f) => f.redes?.facebook },
    { titulo: "Instagram", valor: (f) => f.redes?.instagram },
    { titulo: "LinkedIn", valor: (f) => f.redes?.linkedin },
    { titulo: "Notifica a sus asegurados", valor: (f) => f.notifica },
    { titulo: "Usuarios activos", valor: (f) => f.colaboradores },
    { titulo: "Factura a", valor: (f) => f.facturaA },
    { titulo: "Activa", valor: (f) => f.activa },
  ]);
}
