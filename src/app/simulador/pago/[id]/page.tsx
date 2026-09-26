import { eq } from "drizzle-orm";
import { CircleCheck, CircleX, FlaskConical, Scale } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarcaStlic } from "@/components/marca";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pesos } from "@/lib/formato";
import { simuladorDePagosActivo } from "@/server/cobros";
import { obtenerDb } from "@/server/db";
import * as t from "@/server/db/schema";
import { simularPagoAccion } from "./acciones";

export const metadata: Metadata = { title: "Simulador de pagos" };

export default async function SimuladorPago({ params }: PageProps<"/simulador/pago/[id]">) {
  if (!simuladorDePagosActivo()) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await obtenerDb();
  const [orden] = await db
    .select({
      id: t.ordenes.id,
      numero: t.ordenes.numero,
      total: t.ordenes.total,
      estado: t.ordenes.estado,
      cliente: t.clientes.nombreFactura,
    })
    .from(t.ordenes)
    .innerJoin(t.clientes, eq(t.clientes.id, t.ordenes.clienteFacturacionId))
    .where(eq(t.ordenes.id, id));
  if (!orden) notFound();
  const pendiente = orden.estado === "PEND_PAGO";

  const opcion = (
    resultado: string,
    etiqueta: string,
    icono: React.ReactNode,
    variante: "default" | "outline" | "destructive",
  ) => (
    <form action={simularPagoAccion}>
      <input type="hidden" name="ordenId" value={orden.id} />
      <input type="hidden" name="resultado" value={resultado} />
      <Button type="submit" variant={variante} size="lg" className="w-full">
        {icono} {etiqueta}
      </Button>
    </form>
  );

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <MarcaStlic className="justify-center text-navy" />
        <Alert className="border-warning/50 bg-warning/10">
          <FlaskConical className="text-[oklch(0.5_0.13_70)]" />
          <AlertTitle>Simulador de pagos</AlertTitle>
          <AlertDescription>
            Reemplaza a Mercado Pago en desarrollo. No se cobra nada: el resultado viaja al sistema
            como un aviso firmado, igual que el real.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle>Orden #{orden.numero}</CardTitle>
            <CardDescription>{orden.cliente}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-xl bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Total a pagar</p>
              <p className="text-3xl font-semibold tabular-nums">{pesos(orden.total)}</p>
            </div>
            {pendiente ? (
              <div className="grid gap-3">
                {opcion(
                  "APROBADO",
                  "Aprobar pago",
                  <CircleCheck data-icon="inline-start" />,
                  "default",
                )}
                {opcion(
                  "RECHAZADO",
                  "Rechazar (sin fondos)",
                  <CircleX data-icon="inline-start" />,
                  "outline",
                )}
                {opcion(
                  "IMPORTE_INCORRECTO",
                  "Pagar un importe distinto",
                  <Scale data-icon="inline-start" />,
                  "outline",
                )}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Esta orden ya no está pendiente de pago.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
