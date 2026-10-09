import { CalendarClock, Network, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Centavos } from "@/domain/dinero";
import { hoy } from "@/domain/fecha";
import type { Semaforo } from "@/domain/licencias/periodo";
import { fechaCorta, pesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { altasAGrupoPendientes, renovacionesANegociar } from "@/server/modules/ventas/tablero";
import { anularAltaAGrupoAccion } from "./acciones";

export const metadata: Metadata = { title: "Para negociar" };

const SEMAFORO: Record<Semaforo, { texto: string; clase: string }> = {
  ROJO: { texto: "Vencido", clase: "border-destructive/30 bg-destructive/10 text-destructive" },
  AMARILLO: {
    texto: "Vence pronto",
    clase: "border-warning/50 bg-warning/10 text-[oklch(0.5_0.13_70)] dark:text-warning",
  },
  VERDE: { texto: "En el mes", clase: "border-success/30 bg-success/10 text-success" },
};

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-6 text-sm text-muted-foreground">{children}</p>;
}

export default async function PaginaPendientes() {
  const { rol } = await requerirSofteam();
  const db = await obtenerDb();
  const [negociar, altas] = await Promise.all([
    renovacionesANegociar(db, hoy()),
    altasAGrupoPendientes(db),
  ]);
  const puedeAnular = rol === "ADMINISTRACION";

  return (
    <>
      <EncabezadoPagina
        titulo="Para negociar"
        descripcion="Trimestres iniciales que vencen este mes y altas a grupo que esperan la orden colectiva."
      />

      <Card className="overflow-hidden pb-0" id="renovaciones">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" /> Renovaciones a negociar
          </CardTitle>
          <CardDescription>
            El trimestre inicial no se renueva solo: acordá con el cliente el medio de pago, el
            período (mensual o anual) y el día de vencimiento, y emití la orden manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {negociar.length === 0 ? (
            <Vacio>No hay trimestres por vencer este mes.</Vacio>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Cliente</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Paquete</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="pr-4">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {negociar.map((n) => (
                  <TableRow key={n.contratoId}>
                    <TableCell className="pl-4">
                      <Link
                        href={`/admin/clientes/${n.cliente.id}`}
                        className="text-primary hover:underline"
                      >
                        {n.cliente.nombre}
                      </Link>
                    </TableCell>
                    <TableCell>{n.empresa.nombre}</TableCell>
                    <TableCell>
                      {n.paquete}
                      {n.cantidad > 1 && ` ×${n.cantidad}`}
                    </TableCell>
                    <TableCell className="tabular-nums">{fechaCorta(n.hasta)}</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="outline" className={cn(SEMAFORO[n.semaforo].clase)}>
                          {SEMAFORO[n.semaforo].texto}
                        </Badge>
                        {puedeAnular && (
                          <Link
                            href={`/admin/clientes/${n.cliente.id}/orden-manual?empresa=${n.empresa.id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            Renovar
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden pb-0" id="altas-grupo">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="size-4 text-primary" /> Altas a grupo pendientes
          </CardTitle>
          <CardDescription>
            Paquetes de clientes agrupados que se cobran en la próxima orden colectiva, con su tramo
            proporcional. Hasta entonces se pueden anular.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {altas.length === 0 ? (
            <Vacio>No hay altas esperando la orden colectiva.</Vacio>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Cliente</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Paquete</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className={cn("text-right", !puedeAnular && "pr-4")}>
                    Importe
                  </TableHead>
                  {puedeAnular && <TableHead className="pr-4" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {altas.map((a) => (
                  <TableRow key={a.contratoId}>
                    <TableCell className="pl-4">
                      <Link
                        href={`/admin/clientes/${a.cliente.id}`}
                        className="text-primary hover:underline"
                      >
                        {a.cliente.nombre}
                      </Link>
                    </TableCell>
                    <TableCell>{a.empresa.nombre}</TableCell>
                    <TableCell>
                      {a.paquete}
                      {a.cantidad > 1 && ` ×${a.cantidad}`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.desde ? fechaCorta(a.desde) : "—"}
                      {a.hasta && ` al ${fechaCorta(a.hasta)}`}
                      {a.prorrataDias > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {a.prorrataDias} días proporcionales
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", !puedeAnular && "pr-4")}>
                      {pesos(a.importe as Centavos)}
                    </TableCell>
                    {puedeAnular && (
                      <TableCell className="pr-4 text-right">
                        <form action={anularAltaAGrupoAccion}>
                          <input type="hidden" name="contratoId" value={a.contratoId} />
                          <Button type="submit" variant="ghost" size="sm">
                            <Trash2 data-icon="inline-start" /> Anular
                          </Button>
                        </form>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
