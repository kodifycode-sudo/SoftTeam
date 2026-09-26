import {
  BellRing,
  CircleCheck,
  CircleX,
  Clock,
  LoaderCircle,
  type LucideIcon,
  MailCheck,
  MailWarning,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { SelectNativo } from "@/components/select-nativo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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
import { ETIQUETA_ALERTA } from "@/lib/alertas";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  type EstadoAlerta,
  listarAlertas,
  type TipoAlerta,
} from "@/server/modules/procesos/alertas";
import { listarCorridas } from "@/server/modules/procesos/jobs";
import { descartarAlertaAccion } from "./acciones";
import { EjecutarProcesos } from "./ejecutar";

export const metadata: Metadata = { title: "Procesos y alertas" };

const horaCorta = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

const LIMITE_ALERTAS = 50;

const TRABAJOS: Record<string, string> = {
  renovacion: "Renovación",
  diario: "Proceso diario",
  recordatorios: "Recordatorios de cobro",
};

const ESTADO_CORRIDA: Record<
  "OK" | "ERROR" | "EN_CURSO",
  { etiqueta: string; icono: LucideIcon; clase: string }
> = {
  OK: { etiqueta: "Listo", icono: CircleCheck, clase: "text-success" },
  ERROR: { etiqueta: "Error", icono: CircleX, clase: "text-destructive" },
  EN_CURSO: { etiqueta: "En curso", icono: LoaderCircle, clase: "text-primary" },
};

const ESTADO_ALERTA: Record<EstadoAlerta, { etiqueta: string; icono: LucideIcon; clase: string }> =
  {
    PENDIENTE: { etiqueta: "Pendiente", icono: Clock, clase: "text-muted-foreground" },
    ENVIADA: { etiqueta: "Enviada", icono: MailCheck, clase: "text-success" },
    ERROR: { etiqueta: "Error al enviar", icono: MailWarning, clase: "text-destructive" },
    DESCARTADA: { etiqueta: "Descartada", icono: X, clase: "text-muted-foreground" },
  };

/** Resumen legible de una corrida (lo que guardó cada trabajo). */
function detalleCorrida(job: string, resumen: unknown): string {
  if (!resumen || typeof resumen !== "object") return "";
  if (job === "renovacion" && Array.isArray(resumen)) {
    const ordenes = resumen.reduce((s, r) => s + (r.ordenes ?? 0), 0);
    const omitidos = resumen.reduce((s, r) => s + (r.omitidos?.length ?? 0), 0);
    return `${ordenes} orden${ordenes === 1 ? "" : "es"} generada${ordenes === 1 ? "" : "s"}${omitidos ? `, ${omitidos} omitido${omitidos === 1 ? "" : "s"}` : ""}`;
  }
  if (job === "diario") {
    const r = resumen as { excepcionesVencidas?: number; alertas?: Record<string, number> };
    const alertas = Object.values(r.alertas ?? {}).reduce((s, n) => s + n, 0);
    return `${alertas} alerta${alertas === 1 ? "" : "s"}, ${r.excepcionesVencidas ?? 0} excepción(es) vencida(s)`;
  }
  if (job === "recordatorios") {
    const n = (resumen as { recordatorios?: number }).recordatorios ?? 0;
    return `${n} recordatorio${n === 1 ? "" : "s"}`;
  }
  return "";
}

export default async function PaginaProcesos({ searchParams }: PageProps<"/admin/procesos">) {
  const { rol } = await requerirSofteam(["ADMINISTRACION", "SOPORTE"]);
  const { tipo, estado } = await searchParams;
  const filtros = {
    tipo: typeof tipo === "string" && tipo in ETIQUETA_ALERTA ? (tipo as TipoAlerta) : undefined,
    estado:
      typeof estado === "string" && estado in ESTADO_ALERTA ? (estado as EstadoAlerta) : undefined,
  };
  const db = await obtenerDb();
  const [corridas, alertas] = await Promise.all([
    listarCorridas(db, 30),
    listarAlertas(db, filtros, LIMITE_ALERTAS),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Procesos y alertas"
        descripcion="Renovación quincenal, proceso diario y recordatorios de cobro. Corren solos cada mañana; ejecutarlos de nuevo no duplica nada."
        acciones={rol === "ADMINISTRACION" && <EjecutarProcesos />}
      />

      <section aria-label="Procesos" className="mb-8 grid gap-4 md:grid-cols-3">
        {Object.entries(TRABAJOS).map(([job, nombre]) => {
          const ultima = corridas.find((c) => c.job === job);
          const e = ultima ? ESTADO_CORRIDA[ultima.estado] : undefined;
          return (
            <Card key={job} className="gap-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{nombre}</CardTitle>
                {e && (
                  <span className={cn("inline-flex items-center gap-1 text-xs", e.clase)}>
                    <e.icono className="size-3.5" /> {e.etiqueta}
                  </span>
                )}
              </div>
              {ultima ? (
                <>
                  <CardDescription>Última corrida: {horaCorta(ultima.iniciadoEn)}</CardDescription>
                  {ultima.estado === "ERROR" && ultima.error ? (
                    <p className="line-clamp-3 text-sm text-destructive">{ultima.error}</p>
                  ) : (
                    <p className="text-sm">
                      {detalleCorrida(job, ultima.resumen) || "Sin novedades"}
                    </p>
                  )}
                </>
              ) : (
                <CardDescription>
                  {job === "recordatorios"
                    ? "Corre en los días de recordatorio (10, 20 y 28)."
                    : "Todavía no corrió."}
                </CardDescription>
              )}
            </Card>
          );
        })}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Alertas</h2>

        <search>
          <form className="flex flex-col gap-3 sm:flex-row">
            <SelectNativo
              name="tipo"
              key={filtros.tipo}
              defaultValue={filtros.tipo ?? ""}
              aria-label="Tipo de alerta"
              className="h-10"
            >
              <option value="">Todas las alertas</option>
              {Object.entries(ETIQUETA_ALERTA).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </SelectNativo>
            <SelectNativo
              name="estado"
              key={filtros.estado}
              defaultValue={filtros.estado ?? ""}
              aria-label="Estado de la alerta"
              className="h-10 sm:w-48"
            >
              <option value="">Cualquier estado</option>
              {Object.entries(ESTADO_ALERTA).map(([valor, e]) => (
                <option key={valor} value={valor}>
                  {e.etiqueta}
                </option>
              ))}
            </SelectNativo>
            <Button type="submit" variant="secondary" className="h-10">
              Filtrar
            </Button>
          </form>
        </search>

        {alertas.length === 0 ? (
          <Empty className="border border-dashed bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellRing />
              </EmptyMedia>
              <EmptyTitle>Sin alertas</EmptyTitle>
              <EmptyDescription>
                {filtros.tipo || filtros.estado
                  ? "No hay alertas con esos filtros."
                  : "Las genera el proceso diario: vencimientos, saldos, pagos y límites."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="pl-4">Alerta</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertas.map((a) => {
                    const e = ESTADO_ALERTA[a.estado];
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-md pl-4 whitespace-normal">
                          <p className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{ETIQUETA_ALERTA[a.tipo]}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {horaCorta(a.generadaEn)}
                            </span>
                          </p>
                          <p className="mt-1 text-sm">{a.mensaje}</p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {a.empresaNombre ? (
                            <>
                              <p>{a.empresaNombre}</p>
                              <p className="text-xs text-muted-foreground">#{a.empresaNumero}</p>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1.5 text-sm", e.clase)}>
                            <e.icono className="size-4" /> {e.etiqueta}
                          </span>
                          {a.error && (
                            <p className="max-w-48 truncate text-xs text-destructive">{a.error}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          {a.estado !== "DESCARTADA" && (
                            <form action={descartarAlertaAccion}>
                              <input type="hidden" name="id" value={a.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Descartar alerta"
                              >
                                <X />
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
          </Card>
        )}
        {alertas.length === LIMITE_ALERTAS && (
          <p className="text-xs text-muted-foreground">
            Se muestran las {LIMITE_ALERTAS} más recientes; filtrá para ver otras.
          </p>
        )}
      </section>
    </>
  );
}
