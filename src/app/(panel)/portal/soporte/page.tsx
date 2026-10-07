import { ChevronRight, LifeBuoy, MessageSquareReply, PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Paginacion } from "@/components/panel/listado";
import { EstadoIncidente } from "@/components/soporte/conversacion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { fechaCorta } from "@/lib/formato";
import { hrefListado, leerPagina } from "@/lib/listados";
import { puedeComprar, requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { totalDe } from "@/server/db/listados";
import {
  creditosDeSoporte,
  incidentesDeEmpresa,
  PRODUCTOS_SOPORTE,
} from "@/server/modules/soporte/incidentes";
import { NuevoIncidente } from "./nuevo";

export const metadata: Metadata = { title: "Soporte" };

export default async function PaginaSoporte({ searchParams }: PageProps<"/portal/soporte">) {
  const contexto = await requerirCliente();
  const parametros = await searchParams;
  const pagina = leerPagina(parametros);
  const db = await obtenerDb();
  const [creditos, incidentes] = await Promise.all([
    creditosDeSoporte(db, contexto.empresaId),
    incidentesDeEmpresa(db, contexto.empresaId, contexto.alcance, pagina),
  ]);
  if (incidentes.length === 0 && pagina.numero > 1) {
    redirect(hrefListado("/portal/soporte", parametros, { pagina: 1 }));
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Soporte"
        descripcion="Consultas y problemas con los productos. El soporte técnico usa un ticket de tu licencia; las consultas sobre tu cuenta, licencias y pagos, no."
        acciones={
          <NuevoIncidente productos={PRODUCTOS_SOPORTE} disponibles={creditos.disponibles} />
        }
      />

      <section
        aria-label="Tickets de soporte disponibles"
        className="mb-6 grid grid-cols-3 gap-2 sm:gap-3"
      >
        <Card className="gap-1 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Disponibles</p>
          <p className="text-2xl font-semibold tabular-nums">{creditos.disponibles}</p>
        </Card>
        <Card className="gap-1 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Del mes</p>
          <p className="text-sm tabular-nums sm:text-lg">
            {creditos.mes ? `${creditos.mes.disponible} de ${creditos.mes.total}` : "No incluidos"}
          </p>
        </Card>
        <Card className="gap-1 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Sin vencimiento</p>
          <p className="text-sm tabular-nums sm:text-lg">
            {creditos.saldo
              ? `${creditos.saldo.disponible} de ${creditos.saldo.total}`
              : "No tenés"}
          </p>
        </Card>
      </section>

      {creditos.disponibles <= 0 && (
        <Card className="mb-6 flex-row flex-wrap items-center justify-between gap-3 border-warning/50 bg-warning/10 p-4">
          <p className="text-sm">
            No te quedan tickets de soporte técnico. El cupo mensual se renueva el día 1; para
            seguir ahora, sumá un paquete de soporte. Las consultas sobre tu cuenta, licencias y
            pagos no usan tickets.
          </p>
          {puedeComprar(contexto) && (
            <Link
              href="/portal/paquetes?tipo=CONSUMIBLE"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <PackageSearch data-icon="inline-start" /> Ver paquetes de soporte
            </Link>
          )}
        </Card>
      )}

      {incidentes.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LifeBuoy />
            </EmptyMedia>
            <EmptyTitle>No tenés pedidos de soporte</EmptyTitle>
            <EmptyDescription>
              Si algo no funciona o tenés una duda, escribinos y lo seguimos por acá.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {incidentes.map((i) => (
            <li key={i.id}>
              <Link href={`/portal/soporte/${i.id}`} className="group block">
                <Card className="flex-row items-center gap-4 p-4 transition-shadow group-hover:shadow-md">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        #{i.numero} · {i.asunto}
                      </p>
                      <EstadoIncidente estado={i.estado} />
                      {i.estado === "ESPERANDO_CLIENTE" && (
                        <Badge variant="secondary" className="gap-1">
                          <MessageSquareReply className="size-3" /> Te respondimos
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {PRODUCTOS_SOPORTE[i.producto as keyof typeof PRODUCTOS_SOPORTE] ??
                        i.producto}{" "}
                      · {i.mensajes} mensaje{i.mensajes === 1 ? "" : "s"} · Última actividad{" "}
                      {fechaCorta(i.ultimaActividadEn)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {incidentes.length > 0 && (
        <Paginacion
          pagina={pagina}
          total={totalDe(incidentes)}
          base="/portal/soporte"
          parametros={parametros}
          nombre={["pedido", "pedidos"]}
        />
      )}
    </>
  );
}
