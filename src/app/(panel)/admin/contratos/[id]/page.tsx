import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fechaCorta, numero } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerMovimientosContrato } from "@/server/modules/licencias/movimientos-contrato";

export const metadata: Metadata = { title: "Movimientos del paquete" };

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

const TIPOS = {
  CARGA: "Carga",
  CONSUMO: "Consumo",
  AJUSTE: "Ajuste",
  REINTEGRO: "Reintegro",
} as const;

const ESTADOS: Record<string, string> = {
  PEND_PAGO: "Pendiente de pago",
  PEND_PAGO_ACTIVO: "Habilitado sin pagar",
  ACTIVO: "Activo",
  CANCELADO: "Cancelado",
  BAJA: "Dado de baja",
};

const conSigno = (n: number) => (n > 0 ? `+${numero(n)}` : numero(n));

export default async function MovimientosContrato({ params }: PageProps<"/admin/contratos/[id]">) {
  await requerirSofteam();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const datos = await obtenerMovimientosContrato(await obtenerDb(), id);
  if (!datos) notFound();
  const { contrato: c, movimientos, saldos } = datos;

  return (
    <>
      <EncabezadoPagina
        migas={[
          { texto: "Clientes", href: "/admin/clientes" },
          { texto: c.empresa, href: `/admin/clientes/${c.clienteId}` },
          { texto: c.paquete },
        ]}
        etiqueta={`${c.empresa} · Empresa #${c.empresaNumero}`}
        titulo={`${c.paquete} · ${c.alternativa}${c.cantidad > 1 ? ` ×${c.cantidad}` : ""}`}
        descripcion={
          <>
            {ESTADOS[c.estado] ?? c.estado} · desde {fechaCorta(c.desde)}
            {c.hasta ? ` hasta ${fechaCorta(c.hasta)}` : " hasta agotar el saldo"} ·{" "}
            <Link href={`/admin/ordenes/${c.ordenId}`} className="underline underline-offset-4">
              Orden #{c.ordenNumero}
            </Link>
          </>
        }
      />
      <div className="grid max-w-5xl gap-6">
        {saldos.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saldos.map((s) => (
              <Card key={`${s.recurso}-${s.periodo}`} className="gap-1 p-4">
                <p className="text-sm text-muted-foreground">
                  {s.recurso}
                  {s.periodo && ` · ${s.periodo}`}
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {numero(s.saldo)}
                  {s.unidad && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {s.unidad}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Saldo actual</p>
              </Card>
            ))}
          </div>
        )}
        <Card className="overflow-hidden p-0">
          <CardHeader className="px-4 pt-4">
            <CardTitle>Movimientos de saldo</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {movimientos.length === 0 ? (
              <Empty className="m-4 border border-dashed">
                <EmptyHeader>
                  <EmptyTitle>Sin movimientos</EmptyTitle>
                  <EmptyDescription>
                    Este paquete no tiene créditos consumibles o todavía no se activó.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-4">Fecha</TableHead>
                      <TableHead>Recurso</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Créditos</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="pr-4">Observación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="pl-4 whitespace-nowrap tabular-nums">
                          {fechaHora(m.registradoEn)}
                        </TableCell>
                        <TableCell>
                          {m.recurso}
                          {m.periodo && (
                            <span className="text-muted-foreground"> · {m.periodo}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{TIPOS[m.tipo]}</Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            m.creditos < 0 ? "text-destructive" : "text-success",
                          )}
                        >
                          {conSigno(m.creditos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{numero(m.saldo)}</TableCell>
                        <TableCell className="pr-4 text-muted-foreground">
                          {m.observacion ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
