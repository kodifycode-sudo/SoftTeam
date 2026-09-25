import {
  BookOpenText,
  Cable,
  CircleCheck,
  CircleX,
  Clock,
  Plug,
  Power,
  PowerOff,
  RotateCw,
  Webhook,
} from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fechaCorta } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarEventosRecientes } from "@/server/modules/integraciones/eventos";
import { listarSistemas } from "@/server/modules/integraciones/sistemas";
import { cambiarActivoSistemaAccion, reintentarEventoAccion } from "./acciones";
import { EditarWebhook, NuevoSistema, RotarSecreto } from "./dialogos";

export const metadata: Metadata = { title: "Integraciones" };

const ESTADOS_EVENTO = {
  PENDIENTE: {
    etiqueta: "Pendiente",
    icono: Clock,
    clase: "text-[oklch(0.5_0.13_70)] dark:text-warning",
  },
  ENTREGADO: { etiqueta: "Entregado", icono: CircleCheck, clase: "text-success" },
  FALLIDO: { etiqueta: "Fallido", icono: CircleX, clase: "text-destructive" },
} as const;

const horaCorta = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

export default async function Integraciones() {
  const { rol } = await requerirSofteam();
  const puedeEditar = rol === "ADMINISTRACION";
  const db = await obtenerDb();
  const [sistemas, eventos] = await Promise.all([
    listarSistemas(db),
    listarEventosRecientes(db, 30),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Integraciones"
        descripcion="Sistemas que consultan licencias e informan consumos por la API, y los avisos que reciben."
        acciones={puedeEditar && <NuevoSistema />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section className="space-y-4">
          {sistemas.length === 0 ? (
            <Empty className="border border-dashed bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Plug />
                </EmptyMedia>
                <EmptyTitle>Todavía no hay sistemas integrados</EmptyTitle>
                <EmptyDescription>
                  Dá de alta Prodigal, CotiWeb o BienSeguro para que usen la API.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              {sistemas.map((s) => (
                <Card key={s.id} className={cn("gap-4", !s.activo && "opacity-60")}>
                  <CardHeader className="flex-row items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-brand">
                      <Cable className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle>{s.nombre}</CardTitle>
                      <p className="font-mono text-xs text-muted-foreground">{s.sistema}</p>
                    </div>
                    <Badge variant={s.activo ? "secondary" : "outline"}>
                      {s.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Webhook className="size-4 shrink-0" />
                      <span className="truncate">{s.webhookUrl ?? "Sin webhook"}</span>
                    </p>
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="size-4 shrink-0" />
                      {s.ultimoUsoEn
                        ? `Último uso: ${horaCorta(s.ultimoUsoEn)}`
                        : "Todavía no usó la API"}
                    </p>
                  </CardContent>
                  {puedeEditar && (
                    <CardFooter className="flex-wrap gap-1 border-t">
                      <EditarWebhook id={s.id} sistema={s.sistema} webhookUrl={s.webhookUrl} />
                      <RotarSecreto id={s.id} sistema={s.sistema} />
                      <form action={cambiarActivoSistemaAccion} className="ml-auto">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="activo" value={String(!s.activo)} />
                        <Button type="submit" variant="ghost" size="sm">
                          {s.activo ? (
                            <PowerOff data-icon="inline-start" />
                          ) : (
                            <Power data-icon="inline-start" />
                          )}
                          {s.activo ? "Desactivar" : "Activar"}
                        </Button>
                      </form>
                    </CardFooter>
                  )}
                </Card>
              ))}
            </div>
          )}

          <Card className="overflow-hidden p-0">
            <CardHeader className="px-5 pt-5">
              <CardTitle>Avisos enviados</CardTitle>
              <CardDescription>
                Cada cambio en una empresa genera un aviso por sistema. Si falla, se reintenta con
                espera creciente.
              </CardDescription>
            </CardHeader>
            {eventos.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">Todavía no hay avisos.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-5">Aviso</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden md:table-cell">Detalle</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventos.map((e) => {
                      const estado = ESTADOS_EVENTO[e.estado];
                      const empresa = (e.payload as { empresa?: number }).empresa;
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="pl-5">
                            <p className="font-medium">
                              #{e.id} · Empresa {empresa}
                            </p>
                            <p className="text-xs text-muted-foreground">{horaCorta(e.creadoEn)}</p>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.destino}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 text-sm",
                                estado.clase,
                              )}
                            >
                              <estado.icono className="size-4" /> {estado.etiqueta}
                            </span>
                            {e.intentos > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {e.intentos} intento{e.intentos === 1 ? "" : "s"}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-64 truncate text-xs text-muted-foreground md:table-cell">
                            {e.estado === "ENTREGADO"
                              ? e.entregadoEn && `Entregado ${fechaCorta(e.entregadoEn)}`
                              : (e.ultimoError ??
                                `Próximo intento ${horaCorta(e.proximoIntentoEn)}`)}
                          </TableCell>
                          <TableCell>
                            {puedeEditar && e.estado === "FALLIDO" && (
                              <form action={reintentarEventoAccion}>
                                <input type="hidden" name="id" value={e.id} />
                                <Button type="submit" variant="ghost" size="sm">
                                  <RotateCw data-icon="inline-start" /> Reintentar
                                </Button>
                              </form>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpenText className="size-4 text-primary" /> Cómo se integra un producto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
              <li>Dá de alta el sistema y entregale su secreto.</li>
              <li>
                Cada petición va firmada: cabeceras{" "}
                <code className="text-foreground">x-stlic-sistema</code>,{" "}
                <code className="text-foreground">x-stlic-timestamp</code> y{" "}
                <code className="text-foreground">x-stlic-firma</code> (HMAC-SHA256).
              </li>
              <li>Con webhook, recibe un aviso cuando cambia una empresa y vuelve a leerla.</li>
            </ol>
            <div className="space-y-1.5 rounded-xl bg-muted/50 p-3 font-mono text-xs">
              <p>GET /api/v1/empresas</p>
              <p>GET /api/v1/empresas/&#123;numero&#125;</p>
              <p>GET /api/v1/empresas/&#123;numero&#125;/licencia</p>
              <p>POST /api/v1/empresas/&#123;numero&#125;/consumos</p>
            </div>
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
            >
              Contrato completo (OpenAPI)
            </a>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
