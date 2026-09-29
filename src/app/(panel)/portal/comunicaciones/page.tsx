import { ArrowRight, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  MEDIOS_COMUNICACION,
  type MedioComunicacion,
  TIPOS_USUARIO,
} from "@/domain/comunicaciones/tipos";
import { cn } from "@/lib/utils";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarTiposComunicacion } from "@/server/modules/configuracion/comunicaciones";
import { DialogoTipoComunicacion } from "./dialogo";

export const metadata: Metadata = { title: "Comunicaciones" };

export default async function PaginaComunicaciones() {
  const contexto = await requerirConfiguracionEmpresa();
  const tipos = await listarTiposComunicacion(await obtenerDb(), contexto.empresaId);

  return (
    <>
      <EncabezadoPagina
        titulo="Tipos de comunicación"
        descripcion="Qué comunicaciones envía la empresa, por qué medios, y quién puede originarlas, recibirlas y autorizarlas."
        acciones={<DialogoTipoComunicacion />}
      />
      {tipos.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquare />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay tipos de comunicación</EmptyTitle>
            <EmptyDescription>
              Creá los que usa la empresa: vencimientos, cumpleaños, avisos de siniestro…
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tipos.map((tipo) => (
            <Card key={tipo.id} className={cn("gap-4 p-5", !tipo.activo && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{tipo.nombre}</p>
                  <p className="font-mono text-xs text-muted-foreground">#{tipo.codigo}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!tipo.activo && <Badge variant="outline">Inactivo</Badge>}
                  <DialogoTipoComunicacion
                    tipo={{
                      id: tipo.id,
                      nombre: tipo.nombre,
                      medios: tipo.medios,
                      reglas: tipo.reglas,
                      activo: tipo.activo,
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(MEDIOS_COMUNICACION) as MedioComunicacion[])
                  .filter((m) => tipo.medios[m])
                  .map((m) => (
                    <Badge key={m} variant="secondary">
                      {MEDIOS_COMUNICACION[m]}
                    </Badge>
                  ))}
              </div>
              <ul className="space-y-2 text-sm">
                {tipo.reglas.map((r) => (
                  <li key={r.origen} className="rounded-lg border p-2.5">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{TIPOS_USUARIO[r.origen].etiqueta}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                      <span>{r.destinos.map((d) => TIPOS_USUARIO[d].etiqueta).join(", ")}</span>
                    </p>
                    {r.autorizantes.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Autoriza: {r.autorizantes.map((a) => TIPOS_USUARIO[a].etiqueta).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
