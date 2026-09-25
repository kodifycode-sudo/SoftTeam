import { Info, PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TarjetaPaquete } from "@/components/catalogo/tarjeta-paquete";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { hoy } from "@/domain/fecha";
import { cn } from "@/lib/utils";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarPaquetes } from "@/server/modules/catalogo/paquetes";

export const metadata: Metadata = { title: "Paquetes disponibles" };

export default async function PaquetesDisponibles({ searchParams }: PageProps<"/portal/paquetes">) {
  await requerirCliente();
  const { tipo } = await searchParams;
  const tipoElegido = tipo === "CONSUMIBLE" ? "CONSUMIBLE" : "TEMPORAL";
  const db = await obtenerDb();
  // Solo paquetes públicos y a la venta hoy: el filtro va en el servidor, no en la pantalla.
  const paquetes = await listarPaquetes(db, { hoy: hoy(), tipo: tipoElegido, soloPublicos: true });

  return (
    <>
      <EncabezadoPagina
        titulo="Paquetes disponibles"
        descripcion="Combiná los paquetes que necesites: tu licencia es la suma de todos los que tengas vigentes."
      />

      <Alert className="mb-6 border-primary/20 bg-primary/5">
        <Info className="text-primary" />
        <AlertTitle>La contratación en línea llega en la próxima actualización</AlertTitle>
        <AlertDescription>
          Ya podés ver el catálogo y los precios. Muy pronto vas a poder armar tu carrito, elegir el
          medio de pago y activar los paquetes desde acá.
        </AlertDescription>
      </Alert>

      <div className="mb-6 inline-flex rounded-full border bg-card p-0.5">
        {(
          [
            ["TEMPORAL", "Planes mensuales y anuales"],
            ["CONSUMIBLE", "Créditos sin vencimiento"],
          ] as const
        ).map(([valor, texto]) => (
          <Link
            key={valor}
            href={valor === "TEMPORAL" ? "/portal/paquetes" : "/portal/paquetes?tipo=CONSUMIBLE"}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              tipoElegido === valor
                ? "bg-navy text-navy-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {texto}
          </Link>
        ))}
      </div>

      {paquetes.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>No hay paquetes de este tipo a la venta</EmptyTitle>
            <EmptyDescription>Probá con la otra pestaña o consultanos.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {paquetes.map((p) => (
            <TarjetaPaquete key={p.id} paquete={p} />
          ))}
        </div>
      )}
    </>
  );
}
