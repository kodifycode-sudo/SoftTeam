import { Bell, BellOff, CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ETIQUETA_ALERTA } from "@/lib/alertas";
import { cn } from "@/lib/utils";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { avisosDeEmpresa } from "@/server/modules/procesos/alertas";
import { marcarAvisosLeidosAccion } from "../acciones";

export const metadata: Metadata = { title: "Avisos" };

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

export default async function PaginaAvisos() {
  const contexto = await requerirCliente();
  const avisos = await avisosDeEmpresa(await obtenerDb(), contexto.empresaId);
  const sinLeer = avisos.filter((a) => !a.leidaEn).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Avisos"
        descripcion="Vencimientos, saldos, renovaciones y pagos pendientes. También te los enviamos por mail."
        acciones={
          sinLeer > 0 && (
            <form action={marcarAvisosLeidosAccion}>
              <Button type="submit" variant="outline">
                <CheckCheck data-icon="inline-start" /> Marcar todo como leído
              </Button>
            </form>
          )
        }
      />

      {avisos.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellOff />
            </EmptyMedia>
            <EmptyTitle>No tenés avisos</EmptyTitle>
            <EmptyDescription>
              Te vamos a avisar acá cuando algo necesite tu atención.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden p-0">
          {avisos.map((a) => (
            <article
              key={a.id}
              className={cn("flex gap-4 px-4 py-4 sm:px-5", !a.leidaEn && "bg-primary/5")}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
                  a.leidaEn ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                )}
              >
                <Bell className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.leidaEn ? "outline" : "secondary"}>
                    {ETIQUETA_ALERTA[a.tipo]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{fechaHora(a.generadaEn)}</span>
                  {!a.leidaEn && <span className="sr-only">Sin leer</span>}
                </div>
                <p className={cn("text-sm", !a.leidaEn && "font-medium")}>{a.mensaje}</p>
              </div>
              {!a.leidaEn && (
                <form action={marcarAvisosLeidosAccion} className="shrink-0">
                  <input type="hidden" name="id" value={a.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Marcar como leído"
                    title="Marcar como leído"
                  >
                    <CheckCheck />
                  </Button>
                </form>
              )}
            </article>
          ))}
        </Card>
      )}
    </>
  );
}
