import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { GraficoBarras } from "@/components/graficos/barras";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { SelectNativo } from "@/components/select-nativo";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hoy } from "@/domain/fecha";
import { fechaCorta, numero, pesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { leerParametroDe } from "@/server/modules/parametros";
import {
  cobranzaPorMes,
  consumosPorEmpresa,
  consumosPorMes,
  empresasPorProducto,
  incidentesPorEstado,
  ordenesPendientes,
  vencimientos,
  ventasPorPaquete,
} from "@/server/modules/reportes/reportes";

export const metadata: Metadata = { title: "Reportes" };

const PESTANAS = {
  cobranza: "Cobranza",
  vencimientos: "Vencimientos",
  consumos: "Consumos",
  licencias: "Licencias",
} as const;
type Pestana = keyof typeof PESTANAS;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;
/** Etiqueta del gráfico: solo el mes; el año, en enero (y en el primero de la serie). */
const mesGrafico = (mes: string, i: number) =>
  i === 0 || mes.endsWith("-01") ? mesCorto(mes) : (MESES[Number(mes.slice(5, 7)) - 1] ?? mes);
const aPesos = (centavos: bigint) => Number(centavos) / 100;

function Exportar({ reporte, extra = "" }: { reporte: string; extra?: string }) {
  return (
    <a
      href={`/admin/reportes/exportar?reporte=${reporte}${extra}`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <Download data-icon="inline-start" /> Exportar a Excel
    </a>
  );
}

function Indicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
}) {
  return (
    <Card className="gap-1 p-4 sm:p-5">
      <p className="text-xs text-muted-foreground sm:text-sm">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums sm:text-2xl">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </Card>
  );
}

function Seccion({
  titulo,
  descripcion,
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{titulo}</CardTitle>
          {descripcion && <CardDescription>{descripcion}</CardDescription>}
        </div>
        {acciones}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function PaginaReportes({ searchParams }: PageProps<"/admin/reportes">) {
  await requerirSofteam();
  const sp = await searchParams;
  const pestana: Pestana =
    typeof sp.ver === "string" && sp.ver in PESTANAS ? (sp.ver as Pestana) : "cobranza";
  const fecha = hoy();

  return (
    <>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Cobranza, vencimientos, consumos y licencias. Cada reporte se puede exportar a Excel."
      />
      <nav aria-label="Reportes" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {Object.entries(PESTANAS).map(([clave, nombre]) => (
          <Link
            key={clave}
            href={`/admin/reportes?ver=${clave}`}
            aria-current={pestana === clave ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              pestana === clave && "border-primary text-foreground",
              pestana !== clave && "border-transparent",
            )}
          >
            {nombre}
          </Link>
        ))}
      </nav>
      {pestana === "cobranza" && <Cobranza fecha={fecha} />}
      {pestana === "vencimientos" && (
        <Vencimientos fecha={fecha} dias={typeof sp.dias === "string" ? Number(sp.dias) : 30} />
      )}
      {pestana === "consumos" && (
        <Consumos fecha={fecha} mes={typeof sp.mes === "string" ? sp.mes : fecha.slice(0, 7)} />
      )}
      {pestana === "licencias" && <Licencias fecha={fecha} />}
    </>
  );
}

async function Cobranza({ fecha }: { fecha: ReturnType<typeof hoy> }) {
  const db = await obtenerDb();
  const [meses, pendientes, umbrales] = await Promise.all([
    cobranzaPorMes(db, fecha),
    ordenesPendientes(db, fecha),
    leerParametroDe(db, "cobranza.semaforo_dias"),
  ]);
  const actual = meses.at(-1);
  const totalPendiente = pendientes.reduce((s, p) => s + p.total, 0n);
  const atrasadas = pendientes.filter((p) => p.dias >= umbrales[1]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Indicador titulo="Cobrado este mes" valor={pesos(actual?.cobrado ?? 0n)} />
        <Indicador
          titulo="Pendiente de cobro"
          valor={pesos(totalPendiente)}
          detalle={`${pendientes.length} orden${pendientes.length === 1 ? "" : "es"} impaga${pendientes.length === 1 ? "" : "s"}`}
        />
        <Indicador
          titulo={`Con más de ${umbrales[1]} días`}
          valor={numero(atrasadas.length)}
          detalle={pesos(atrasadas.reduce((s, p) => s + p.total, 0n))}
        />
      </div>

      <Seccion
        titulo="Emitido y cobrado por mes"
        descripcion="Lo emitido cuenta las órdenes no canceladas del mes; lo cobrado, los pagos acreditados en el mes."
        acciones={<Exportar reporte="cobranza" />}
      >
        <GraficoBarras
          descripcion="Emitido y cobrado en los últimos 12 meses"
          series={[
            { nombre: "Emitido", color: "var(--chart-1)" },
            { nombre: "Cobrado", color: "var(--chart-2)" },
          ]}
          grupos={meses.map((m, i) => ({
            etiqueta: mesGrafico(m.mes, i),
            detalle: mesCorto(m.mes),
            valores: [aPesos(m.emitido), aPesos(m.cobrado)],
          }))}
          unidad="pesos"
        />
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Órdenes</TableHead>
                <TableHead className="text-right">Emitido</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...meses].reverse().map((m) => (
                <TableRow key={m.mes}>
                  <TableCell className="capitalize">{mesCorto(m.mes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.ordenes}</TableCell>
                  <TableCell className="text-right tabular-nums">{pesos(m.emitido)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pesos(m.cobrado)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pesos(m.pendiente)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Seccion>

      <Seccion
        titulo="Órdenes impagas"
        descripcion={`De la más antigua a la más nueva. Amarillo desde ${umbrales[0]} días, rojo desde ${umbrales[1]}.`}
        acciones={<Exportar reporte="pendientes" />}
      >
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay órdenes impagas.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Emitida</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        href={`/admin/ordenes/${o.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        #{o.numero}
                      </Link>
                      {o.tipoGeneracion === "RENOVACION" && (
                        <Badge variant="secondary" className="ml-2">
                          Renovación
                        </Badge>
                      )}
                      {o.pagoError && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-destructive/40 text-destructive"
                        >
                          Pago rechazado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{o.empresa ?? `Agrupada · ${o.cliente}`}</TableCell>
                    <TableCell>{fechaCorta(o.emitidaEn)}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                          o.dias >= umbrales[1]
                            ? "bg-destructive/10 text-destructive"
                            : o.dias >= umbrales[0]
                              ? "bg-warning/15 text-[oklch(0.45_0.12_70)]"
                              : "bg-success/10 text-success",
                        )}
                      >
                        {o.dias}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(o.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

const ESTADO_RENOVACION = {
  NO_RENOVAR: {
    etiqueta: "No se renueva",
    clase: "border-muted-foreground/30 text-muted-foreground",
  },
  SIN_ORDEN: { etiqueta: "Sin orden", clase: "border-warning/60 bg-warning/10" },
  ORDEN_PENDIENTE: { etiqueta: "Orden impaga", clase: "border-primary/40 text-primary" },
  RENOVADO: { etiqueta: "Renovado", clase: "border-success/40 text-success" },
} as const;

async function Vencimientos({ fecha, dias }: { fecha: ReturnType<typeof hoy>; dias: number }) {
  const proximos = [15, 30, 60, 90].includes(dias) ? dias : 30;
  const filas = await vencimientos(await obtenerDb(), fecha, { proximosDias: proximos });
  const vencidos = filas.filter((f) => f.dias < 0);
  const porVencer = filas.filter((f) => f.dias >= 0);
  const sinResolver = porVencer.filter(
    (f) => f.estado === "SIN_ORDEN" || f.estado === "ORDEN_PENDIENTE",
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Indicador titulo={`Vencen en ${proximos} días`} valor={numero(porVencer.length)} />
        <Indicador
          titulo="Sin renovación paga"
          valor={numero(sinResolver.length)}
          detalle="Sin orden o con la orden impaga"
        />
        <Indicador
          titulo="Vencidos sin renovar"
          valor={numero(vencidos.length)}
          detalle="En los últimos 30 días"
        />
      </div>
      <Seccion
        titulo="Paquetes por vencer y vencidos sin renovar"
        descripcion="Para anticipar la cobranza y llamar a quien no renovó."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-2">
              <input type="hidden" name="ver" value="vencimientos" />
              <SelectNativo
                name="dias"
                defaultValue={String(proximos)}
                aria-label="Próximos días"
                className="h-8 w-36"
              >
                {[15, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    Próximos {d} días
                  </option>
                ))}
              </SelectNativo>
              <Button type="submit" variant="secondary" size="sm">
                Ver
              </Button>
            </form>
            <Exportar reporte="vencimientos" />
          </div>
        }
      >
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay vencimientos en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Paquete</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Renovación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => {
                  const e = ESTADO_RENOVACION[f.estado];
                  return (
                    <TableRow key={f.contratoId} className={cn(f.dias < 0 && "bg-destructive/5")}>
                      <TableCell>
                        <p className="font-medium">{f.empresa}</p>
                        <p className="text-xs text-muted-foreground">#{f.empresaNumero}</p>
                      </TableCell>
                      <TableCell>
                        {f.paquete}
                        {f.cantidad > 1 && (
                          <span className="text-muted-foreground"> ×{f.cantidad}</span>
                        )}
                      </TableCell>
                      <TableCell>{fechaCorta(f.hasta)}</TableCell>
                      <TableCell
                        className={cn("text-right tabular-nums", f.dias < 0 && "text-destructive")}
                      >
                        {f.dias < 0 ? `Venció hace ${-f.dias}` : f.dias}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={e.clase}>
                          {e.etiqueta}
                          {f.ordenRenovacion && ` · #${f.ordenRenovacion}`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

const FAMILIAS = [
  { familia: "notificaciones", nombre: "Notificaciones", color: "var(--chart-1)" },
  { familia: "cotizaciones", nombre: "Cotizaciones", color: "var(--chart-2)" },
  { familia: "soporte", nombre: "Soporte", color: "var(--chart-3)" },
] as const;

async function Consumos({ fecha, mes }: { fecha: ReturnType<typeof hoy>; mes: string }) {
  const db = await obtenerDb();
  const mesElegido = /^\d{4}-\d{2}$/.test(mes) ? mes : fecha.slice(0, 7);
  const [porMes, porEmpresa] = await Promise.all([
    consumosPorMes(db, fecha, 6),
    consumosPorEmpresa(db, mesElegido),
  ]);
  const meses = [...new Set(porMes.map((f) => f.mes))];
  const credito = (m: string, familia: string) =>
    porMes.find((f) => f.mes === m && f.familia === familia)?.creditos ?? 0;

  return (
    <div className="space-y-6">
      <Seccion
        titulo="Créditos consumidos por mes"
        descripcion="Lo que informaron los productos (notificaciones, cotizaciones) y los tickets de soporte."
        acciones={<Exportar reporte="consumos" />}
      >
        {meses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay consumos.</p>
        ) : (
          <>
            <GraficoBarras
              descripcion="Créditos consumidos por mes y familia"
              series={FAMILIAS.map((f) => ({ nombre: f.nombre, color: f.color }))}
              grupos={meses.map((m, i) => ({
                etiqueta: mesGrafico(m, i),
                detalle: mesCorto(m),
                valores: FAMILIAS.map((f) => credito(m, f.familia)),
              }))}
            />
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    {FAMILIAS.map((f) => (
                      <TableHead key={f.familia} className="text-right">
                        {f.nombre}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...meses].reverse().map((m) => (
                    <TableRow key={m}>
                      <TableCell className="capitalize">{mesCorto(m)}</TableCell>
                      {FAMILIAS.map((f) => (
                        <TableCell key={f.familia} className="text-right tabular-nums">
                          {numero(credito(m, f.familia))}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Seccion>

      <Seccion
        titulo={`Quién más consumió en ${mesCorto(mesElegido)}`}
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-2">
              <input type="hidden" name="ver" value="consumos" />
              <input
                type="month"
                name="mes"
                defaultValue={mesElegido}
                aria-label="Mes"
                className="h-8 rounded-lg border bg-transparent px-2 text-sm"
              />
              <Button type="submit" variant="secondary" size="sm">
                Ver
              </Button>
            </form>
            <Exportar reporte="consumos-empresas" extra={`&mes=${mesElegido}`} />
          </div>
        }
      >
        {porEmpresa.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin consumos en ese mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Familia</TableHead>
                  <TableHead className="text-right">Operaciones</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {porEmpresa.map((f) => (
                  <TableRow key={`${f.empresaId}-${f.familia}`}>
                    <TableCell>
                      {f.empresa}{" "}
                      <span className="text-xs text-muted-foreground">#{f.empresaNumero}</span>
                    </TableCell>
                    <TableCell className="capitalize">{f.familia}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numero(f.operaciones)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{numero(f.creditos)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

const ESTADOS_INCIDENTE = {
  ABIERTO: "Abiertos",
  EN_CURSO: "En curso",
  ESPERANDO_CLIENTE: "Esperando al cliente",
  RESUELTO: "Resueltos",
  CERRADO: "Cerrados",
} as const;

async function Licencias({ fecha }: { fecha: ReturnType<typeof hoy> }) {
  const db = await obtenerDb();
  const [productos, ventas, incidentes] = await Promise.all([
    empresasPorProducto(db, fecha),
    ventasPorPaquete(db, fecha),
    incidentesPorEstado(db),
  ]);
  const maximo = Math.max(1, ...productos.map((p) => p.empresas));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Seccion
        titulo="Empresas por producto"
        descripcion="Empresas activas con el producto licenciado hoy."
        acciones={<Exportar reporte="productos" />}
      >
        {productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna empresa tiene licencias vigentes.</p>
        ) : (
          <ul className="space-y-3">
            {productos.map((p) => (
              <li key={p.productoId} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{p.producto}</span>
                  <span className="font-semibold tabular-nums">{numero(p.empresas)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(p.empresas / maximo) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Tickets de soporte" descripcion="Por estado, desde el inicio.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(ESTADOS_INCIDENTE).map(([estado, nombre]) => (
            <div key={estado} className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{nombre}</p>
              <p className="text-xl font-semibold tabular-nums">
                {numero(incidentes.find((i) => i.estado === estado)?.cantidad ?? 0)}
              </p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Ventas por paquete"
        descripcion="Últimos 12 meses, órdenes no canceladas. Importes con impuestos."
        acciones={<Exportar reporte="ventas" />}
      >
        {ventas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ventas.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paquete</TableHead>
                  <TableHead className="text-right">Altas</TableHead>
                  <TableHead className="text-right">Renovaciones</TableHead>
                  <TableHead className="text-right">Facturado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.map((v) => (
                  <TableRow key={v.paquete}>
                    <TableCell>{v.paquete}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.altas}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.renovaciones}</TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(v.facturado)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>
    </div>
  );
}
