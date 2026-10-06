import { CircleCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Conversacion, EstadoIncidente } from "@/components/soporte/conversacion";
import { ResponderIncidente } from "@/components/soporte/responder";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerIncidente, PRODUCTOS_SOPORTE } from "@/server/modules/soporte/incidentes";
import { cerrarIncidenteAccion, responderClienteAccion } from "../acciones";

export const metadata: Metadata = { title: "Pedido de soporte" };

export default async function PedidoSoporte({
  params,
  searchParams,
}: PageProps<"/portal/soporte/[id]">) {
  const contexto = await requerirCliente();
  const [{ id }, { nuevo }] = await Promise.all([params, searchParams]);
  const incidente = await obtenerIncidente(await obtenerDb(), id, {
    empresaId: contexto.empresaId,
    alcance: contexto.alcance,
  });
  if (!incidente) notFound();
  const cerrado = incidente.estado === "CERRADO";

  return (
    <>
      {nuevo === "1" && (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <CircleCheck />
          <AlertDescription className="text-success">
            Recibimos tu pedido #{incidente.numero}. Te avisamos por mail cuando respondamos.
          </AlertDescription>
        </Alert>
      )}
      <EncabezadoPagina
        migas={[
          { texto: "Soporte", href: "/portal/soporte" },
          { texto: `Pedido #${incidente.numero}` },
        ]}
        etiqueta={`#${incidente.numero} · ${PRODUCTOS_SOPORTE[incidente.producto as keyof typeof PRODUCTOS_SOPORTE] ?? incidente.producto}`}
        titulo={incidente.asunto}
        acciones={
          <>
            <EstadoIncidente estado={incidente.estado} />
            {!cerrado && (
              <form action={cerrarIncidenteAccion}>
                <input type="hidden" name="incidenteId" value={incidente.id} />
                <Button type="submit" variant="ghost" size="sm">
                  <XCircle data-icon="inline-start" /> Cerrar pedido
                </Button>
              </form>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="space-y-6">
          <Conversacion
            mensajes={incidente.mensajes}
            vista="cliente"
            rutaAdjuntos="/portal/soporte/adjuntos"
          />
          {cerrado ? (
            <p className="rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">
              Este pedido está cerrado. Si necesitás más ayuda, abrí uno nuevo.
            </p>
          ) : (
            <div className="border-t pt-6">
              <ResponderIncidente incidenteId={incidente.id} accion={responderClienteAccion} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
