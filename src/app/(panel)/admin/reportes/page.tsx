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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { type Fecha, hoy, sumarMeses } from "@/domain/fecha";
import { type Rango, rangoDeDias, rangoDeMeses } from "@/domain/reportes/periodos";
import { fechaCorta, numero, pesos, porcentajeTexto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { opcionesEmisores } from "@/server/modules/catalogo/emisores";
import { leerParametroDe } from "@/server/modules/parametros";
import {
  bonificacionesOtorgadas,
  consumiblesRenovados,
  type EstadoSerie,
  pedidosSinSaldo,
  renovacionesPorMes,
  resumenTickets,
  seriesDeTickets,
  trimestresIniciales,
} from "@/server/modules/reportes/comerciales";
import {
  cobranzaPorMes,
  consumosPorEmpresa,
  consumosPorMes,
  empresasPorProducto,
  incidentesPorEstado,
  libroDeVentas,
  ordenesPendientes,
  vencimientos,
  ventasPorPaquete,
} from "@/server/modules/reportes/reportes";

export const metadata: Metadata = { title: "Reportes" };

const PESTANAS = {
  cobranza: "Cobranza",
  facturacion: "Facturación",
  comercial: "Tickets y bonificaciones",
  renovaciones: "Renovaciones",
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

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Rango de meses de la pantalla: "desde" y "hasta" con un formulario GET. */
function FiltroMeses({ ver, meses }: { ver: string; meses: string[] }) {
  return (
    <form className="mb-6 flex flex-wrap items-end gap-3" aria-label="Período">
      <input type="hidden" name="ver" value={ver} />
      <label htmlFor="filtro-desde" className="grid gap-1 text-sm">
        <span className="text-muted-foreground">Desde</span>
        <Input
          type="month"
          id="filtro-desde"
          name="desde"
          defaultValue={meses[0]}
          className="h-9 w-48"
        />
      </label>
      <label htmlFor="filtro-hasta" className="grid gap-1 text-sm">
        <span className="text-muted-foreground">Hasta</span>
        <Input
          type="month"
          id="filtro-hasta"
          name="hasta"
          defaultValue={meses.at(-1)}
          className="h-9 w-48"
        />
      </label>
      <Button type="submit" variant="secondary" className="h-9">
        Aplicar
      </Button>
      <p className="w-full text-xs text-muted-foreground sm:w-auto">
        {meses.length} mes{meses.length === 1 ? "" : "es"} (hasta 36).
      </p>
    </form>
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
  const { meses, rango } = rangoDeMeses(texto(sp.desde), texto(sp.hasta), fecha);
  const periodo = `&desde=${meses[0]}&hasta=${meses.at(-1)}`;

  return (
    <>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Cobranza, facturación, tickets, bonificaciones, renovaciones, consumos y licencias. Cada reporte se puede exportar a Excel."
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
      {(pestana === "cobranza" ||
        pestana === "licencias" ||
        pestana === "comercial" ||
        pestana === "renovaciones") && <FiltroMeses ver={pestana} meses={meses} />}
      {pestana === "cobranza" && <Cobranza fecha={fecha} meses={meses} periodo={periodo} />}
      {pestana === "facturacion" && (
        <Facturacion
          fecha={fecha}
          desde={texto(sp.desde)}
          hasta={texto(sp.hasta)}
          emisorId={texto(sp.emisor)}
          comprobante={texto(sp.comprobante)}
        />
      )}
      {pestana === "vencimientos" && (
        <Vencimientos fecha={fecha} dias={typeof sp.dias === "string" ? Number(sp.dias) : 30} />
      )}
      {pestana === "consumos" && (
        <Consumos fecha={fecha} mes={typeof sp.mes === "string" ? sp.mes : fecha.slice(0, 7)} />
      )}
      {pestana === "comercial" && <Comercial fecha={fecha} rango={rango} periodo={periodo} />}
      {pestana === "renovaciones" && <Renovaciones meses={meses} rango={rango} periodo={periodo} />}
      {pestana === "licencias" && (
        <Licencias fecha={fecha} rango={rango} periodo={periodo} meses={meses} />
      )}
    </>
  );
}

async function Cobranza({
  fecha,
  meses: lista,
  periodo,
}: {
  fecha: ReturnType<typeof hoy>;
  meses: string[];
  periodo: string;
}) {
  const db = await obtenerDb();
  const [meses, pendientes, umbrales] = await Promise.all([
    cobranzaPorMes(db, lista),
    ordenesPendientes(db, fecha),
    leerParametroDe(db, "cobranza.semaforo_dias"),
  ]);
  const actual = meses.at(-1);
  const totalPendiente = pendientes.reduce((s, p) => s + p.total, 0n);
  const atrasadas = pendientes.filter((p) => p.dias >= umbrales[1]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Indicador
          titulo="Cobrado en el período"
          valor={pesos(meses.reduce((s, m) => s + m.cobrado, 0n))}
          detalle={`Último mes: ${pesos(actual?.cobrado ?? 0n)}`}
        />
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
        acciones={<Exportar reporte="cobranza" extra={periodo} />}
      >
        <GraficoBarras
          descripcion="Emitido y cobrado por mes en el período"
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
  const delMes: Rango = {
    desde: `${mesElegido}-01` as Fecha,
    hasta: sumarMeses(`${mesElegido}-01` as Fecha, 1),
  };
  const [porMes, porEmpresa, renovados, sinSaldo] = await Promise.all([
    consumosPorMes(db, fecha, 6),
    consumosPorEmpresa(db, mesElegido),
    consumiblesRenovados(db, delMes),
    pedidosSinSaldo(db, delMes),
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Seccion
          titulo={`Pedidos sin saldo en ${mesCorto(mesElegido)}`}
          descripcion="Pedidos de los productos que no alcanzaron: parciales (se entregó lo que había) y sin saldo."
          acciones={<Exportar reporte="sin-saldo" extra={`&mes=${mesElegido}`} />}
        >
          {sinSaldo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos los pedidos alcanzaron.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Familia</TableHead>
                    <TableHead className="text-right">Parciales</TableHead>
                    <TableHead className="text-right">Sin saldo</TableHead>
                    <TableHead className="text-right">Entregado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sinSaldo.map((p) => (
                    <TableRow key={`${p.empresaId}-${p.familia}`}>
                      <TableCell>
                        {p.empresa}{" "}
                        <span className="text-xs text-muted-foreground">#{p.empresaNumero}</span>
                      </TableCell>
                      <TableCell className="capitalize">{p.familia}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.parciales}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.sinSaldo}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numero(p.entregado)} de {numero(p.solicitado)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Seccion>

        <Seccion
          titulo={`Consumibles renovados en ${mesCorto(mesElegido)}`}
          descripcion="Renovaciones automáticas por saldo, con su orden (o la orden colectiva pendiente)."
          acciones={<Exportar reporte="consumibles-renovados" extra={`&mes=${mesElegido}`} />}
        >
          {renovados.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se renovaron consumibles.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Paquete</TableHead>
                    <TableHead>Orden</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renovados.map((c) => (
                    <TableRow key={c.contratoId}>
                      <TableCell className="whitespace-nowrap">{fechaCorta(c.creadoEn)}</TableCell>
                      <TableCell>{c.empresa}</TableCell>
                      <TableCell>
                        {c.paquete}
                        {c.cantidad > 1 && ` ×${c.cantidad}`}
                      </TableCell>
                      <TableCell>
                        {c.ordenId ? (
                          <Link
                            href={`/admin/ordenes/${c.ordenId}`}
                            className="text-primary hover:underline"
                          >
                            #{c.orden}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Colectiva pendiente</span>
                        )}
                        {c.ordenEstado && (
                          <span className="block text-xs text-muted-foreground">
                            {ESTADO_ORDEN[c.ordenEstado]}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Seccion>
      </div>
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

async function Licencias({
  fecha,
  rango,
  periodo,
  meses,
}: {
  fecha: ReturnType<typeof hoy>;
  rango: Rango;
  periodo: string;
  meses: string[];
}) {
  const db = await obtenerDb();
  const [productos, ventas, incidentes] = await Promise.all([
    empresasPorProducto(db, fecha),
    ventasPorPaquete(db, rango),
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
        descripcion={`De ${mesCorto(meses[0] ?? "")} a ${mesCorto(meses.at(-1) ?? "")}, órdenes no canceladas. Importes con impuestos.`}
        acciones={<Exportar reporte="ventas" extra={periodo} />}
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

const COMPROBANTES = ["A", "B"] as const;

/**
 * Libro de ventas: facturas del período con lo que se informó en cada una,
 * para conciliar con Xubio. Totales por emisor y tipo de comprobante.
 */
async function Facturacion({
  fecha,
  desde,
  hasta,
  emisorId,
  comprobante,
}: {
  fecha: ReturnType<typeof hoy>;
  desde: string | undefined;
  hasta: string | undefined;
  emisorId: string | undefined;
  comprobante: string | undefined;
}) {
  const db = await obtenerDb();
  const dias = rangoDeDias(desde, hasta, fecha);
  const tipo = COMPROBANTES.find((c) => c === comprobante);
  const emisores = await opcionesEmisores(db);
  const emisor = emisores.find((e) => e.id === emisorId)?.id;
  const filas = await libroDeVentas(db, { rango: dias.rango, emisorId: emisor, comprobante: tipo });
  const sumar = (de: typeof filas, campo: "netoGravado" | "iva" | "total") =>
    de.reduce((s, f) => s + f[campo], 0n);
  const grupos = [...new Set(filas.map((f) => `${f.emisor ?? "Sin emisor"}|${f.comprobante}`))]
    .sort()
    .map((clave) => {
      const [nombre, letra] = clave.split("|");
      const de = filas.filter((f) => `${f.emisor ?? "Sin emisor"}|${f.comprobante}` === clave);
      return {
        clave,
        nombre,
        letra,
        cantidad: de.length,
        neto: sumar(de, "netoGravado"),
        iva: sumar(de, "iva"),
        total: sumar(de, "total"),
      };
    });
  const extra = `&${new URLSearchParams({ desde: dias.desde, hasta: dias.hasta, emisor: emisor ?? "", comprobante: tipo ?? "" })}`;

  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-3" aria-label="Filtros de facturación">
        <input type="hidden" name="ver" value="facturacion" />
        <label htmlFor="filtro-desde" className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Desde</span>
          <Input
            type="date"
            id="filtro-desde"
            name="desde"
            defaultValue={dias.desde}
            className="h-9 w-40"
          />
        </label>
        <label htmlFor="filtro-hasta" className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Hasta</span>
          <Input
            type="date"
            id="filtro-hasta"
            name="hasta"
            defaultValue={dias.hasta}
            className="h-9 w-40"
          />
        </label>
        <label htmlFor="filtro-emisor" className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Emisor</span>
          <SelectNativo
            id="filtro-emisor"
            name="emisor"
            defaultValue={emisor ?? ""}
            className="h-9 w-56"
          >
            <option value="">Todos</option>
            {emisores.map((e) => (
              <option key={e.id} value={e.id}>
                {e.razonSocial}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label htmlFor="filtro-comprobante" className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Comprobante</span>
          <SelectNativo
            id="filtro-comprobante"
            name="comprobante"
            defaultValue={tipo ?? ""}
            className="h-9 w-32"
          >
            <option value="">Todos</option>
            <option value="A">Factura A</option>
            <option value="B">Factura B</option>
          </SelectNativo>
        </label>
        <Button type="submit" variant="secondary" className="h-9">
          Aplicar
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Indicador titulo="Facturas" valor={numero(filas.length)} />
        <Indicador titulo="Neto gravado" valor={pesos(sumar(filas, "netoGravado"))} />
        <Indicador titulo="IVA" valor={pesos(sumar(filas, "iva"))} />
        <Indicador titulo="Total facturado" valor={pesos(sumar(filas, "total"))} />
      </div>

      <Seccion
        titulo="Por emisor y comprobante"
        descripcion={`Facturas del ${fechaCorta(dias.desde)} al ${fechaCorta(dias.hasta)}.`}
      >
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay facturas en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emisor</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead className="text-right">Facturas</TableHead>
                  <TableHead className="text-right">Neto gravado</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.clave}>
                    <TableCell>{g.nombre}</TableCell>
                    <TableCell>Factura {g.letra}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.cantidad}</TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(g.neto)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(g.iva)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(g.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Libro de ventas"
        descripcion="Cada factura con lo que se informó: cliente, condición frente al IVA, neto, alícuota e IVA."
        acciones={<Exportar reporte="facturacion" extra={extra} />}
      >
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay facturas en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Condición</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f) => (
                  <TableRow key={f.ordenId}>
                    <TableCell className="whitespace-nowrap">
                      {f.facturadaEn ? fechaCorta(f.facturadaEn) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {/* El número ya trae la letra del comprobante. */}
                      <span className="tabular-nums">{f.factura}</span>
                      <Link
                        href={`/admin/ordenes/${f.ordenId}`}
                        className="block text-xs text-primary hover:underline"
                      >
                        Orden #{f.orden}
                      </Link>
                      {f.estado === "CANCELADA" && (
                        <Badge
                          variant="outline"
                          className="mt-1 border-destructive/40 text-destructive"
                        >
                          Orden cancelada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {f.cliente}
                      <span className="block text-xs text-muted-foreground">
                        CUIT {formatearCuit(f.clienteCuit)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{f.condicionIva}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pesos(f.netoGravado)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pesos(f.iva)}
                      <span className="block text-xs text-muted-foreground">
                        {porcentajeTexto(f.alicuotaIva)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(f.total)}</TableCell>
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

const ESTADO_ORDEN = { PEND_PAGO: "Pendiente", PAGADA: "Pagada", CANCELADA: "Cancelada" } as const;

const ESTADO_SERIE: Record<EstadoSerie, { etiqueta: string; clase: string }> = {
  VIGENTE: { etiqueta: "Vigente", clase: "border-success/40 text-success" },
  AGOTADA: { etiqueta: "Tope agotado", clase: "border-muted-foreground/30 text-muted-foreground" },
  VENCIDA: { etiqueta: "Vencida", clase: "border-muted-foreground/30 text-muted-foreground" },
};

/** Tickets (resumen y series) y bonificaciones otorgadas en el período. */
async function Comercial({
  fecha,
  rango,
  periodo,
}: {
  fecha: ReturnType<typeof hoy>;
  rango: Rango;
  periodo: string;
}) {
  const db = await obtenerDb();
  const [tickets, series, bonificaciones] = await Promise.all([
    resumenTickets(db, rango),
    seriesDeTickets(db, rango, fecha),
    bonificacionesOtorgadas(db, rango),
  ]);
  const descontado = tickets.reduce((s, t) => s + t.descontado, 0n);
  const bonificado = bonificaciones.reduce((s, b) => s + b.bonificado, 0n);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Indicador titulo="Descontado con tickets" valor={pesos(descontado)} />
        <Indicador
          titulo="Compras con ticket"
          valor={numero(tickets.reduce((s, t) => s + t.usos, 0))}
          detalle={`${numero(tickets.reduce((s, t) => s + t.renovaciones, 0))} renovaciones lo heredaron`}
        />
        <Indicador titulo="Bonificado" valor={pesos(bonificado)} />
        <Indicador
          titulo="Paquetes bonificados"
          valor={numero(bonificaciones.length)}
          detalle={`${numero(bonificaciones.filter((b) => b.recurrente).length)} recurrentes`}
        />
      </div>

      <Seccion
        titulo="Tickets"
        descripcion="Órdenes del período con cada ticket: compras donde se aplicó, renovaciones que lo heredaron y lo descontado."
        acciones={<Exportar reporte="tickets" extra={periodo} />}
      >
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se usaron tickets en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                  <TableHead className="text-right">Renovaciones</TableHead>
                  <TableHead className="text-right">Descontado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((k) => (
                  <TableRow key={k.ticketId}>
                    <TableCell>
                      <span className="font-mono font-semibold">{k.codigo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {porcentajeTexto(k.porcentaje)}
                        {k.tope > 0n ? ` · tope ${pesos(k.tope)}` : " · sin tope"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{k.usos}</TableCell>
                    <TableCell className="text-right tabular-nums">{k.renovaciones}</TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(k.descontado)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Saldo de cada serie"
        descripcion="Compras con ticket del período y sus renovaciones: lo descontado en toda la serie y lo que queda del tope. La herencia vence a los 12 meses."
        acciones={<Exportar reporte="series-tickets" extra={periodo} />}
      >
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay compras con ticket en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Descontado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((s) => (
                  <TableRow key={s.ordenId}>
                    <TableCell>
                      <Link
                        href={`/admin/ordenes/${s.ordenId}`}
                        className="text-primary hover:underline"
                      >
                        #{s.orden}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {fechaCorta(s.emitidaEn)}
                        {s.renovaciones > 0 && ` · ${s.renovaciones} renovaciones`}
                      </span>
                    </TableCell>
                    <TableCell>{s.cliente}</TableCell>
                    <TableCell className="font-mono">{s.codigo}</TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(s.descontado)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.saldo === null ? "Sin tope" : pesos(s.saldo)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ESTADO_SERIE[s.estado].clase}>
                        {ESTADO_SERIE[s.estado].etiqueta}
                      </Badge>
                      {s.estado === "VIGENTE" && (
                        <span className="block text-xs text-muted-foreground">
                          hasta el {fechaCorta(s.vence)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Bonificaciones otorgadas"
        descripcion="Paquetes bonificados en órdenes del período: cuánto, por qué, si es recurrente y quién la otorgó."
        acciones={<Exportar reporte="bonificaciones" extra={periodo} />}
      >
        {bonificaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo bonificaciones en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Paquete</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Otorgada por</TableHead>
                  <TableHead className="text-right">Bonificado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bonificaciones.map((b) => (
                  <TableRow key={b.contratoId}>
                    <TableCell>
                      <Link
                        href={`/admin/ordenes/${b.ordenId}`}
                        className="text-primary hover:underline"
                      >
                        #{b.orden}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {fechaCorta(b.emitidaEn)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {b.cliente}
                      <span className="block text-xs text-muted-foreground">{b.empresa}</span>
                    </TableCell>
                    <TableCell>
                      {b.paquete}
                      <span className="block text-xs text-muted-foreground">
                        {porcentajeTexto(b.porcentaje)}
                        {b.recurrente && " · recurrente"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64 text-sm">{b.motivo ?? "—"}</TableCell>
                    <TableCell className="text-sm">{b.otorgadaPor ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pesos(b.bonificado)}</TableCell>
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

/** Renovaciones automáticas por mes y trimestres iniciales que vencen en el período. */
async function Renovaciones({
  meses: lista,
  rango,
  periodo,
}: {
  meses: string[];
  rango: Rango;
  periodo: string;
}) {
  const db = await obtenerDb();
  const [meses, trimestres] = await Promise.all([
    renovacionesPorMes(db, lista),
    trimestresIniciales(db, rango),
  ]);
  const negociados = trimestres.filter((t) => t.renovacion !== null).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Indicador
          titulo="Renovaciones generadas"
          valor={numero(meses.reduce((s, m) => s + m.ordenes, 0))}
          detalle={pesos(meses.reduce((s, m) => s + m.emitido, 0n))}
        />
        <Indicador
          titulo="Impagas"
          valor={numero(meses.reduce((s, m) => s + m.impagas, 0))}
          detalle={pesos(meses.reduce((s, m) => s + m.pendiente, 0n))}
        />
        <Indicador
          titulo="Días proporcionales cobrados"
          valor={pesos(meses.reduce((s, m) => s + m.proporcional, 0n))}
          detalle={`${numero(meses.reduce((s, m) => s + m.diasProporcionales, 0))} días`}
        />
        <Indicador
          titulo="Trimestres negociados"
          valor={`${numero(negociados)} de ${numero(trimestres.length)}`}
        />
      </div>

      <Seccion
        titulo="Renovaciones automáticas por mes"
        descripcion="Órdenes que generaron las corridas, por mes de emisión: pagadas, impagas, canceladas y días proporcionales para alinear vencimientos."
        acciones={<Exportar reporte="renovaciones" extra={periodo} />}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Órdenes</TableHead>
                <TableHead className="text-right">Pagadas</TableHead>
                <TableHead className="text-right">Impagas</TableHead>
                <TableHead className="text-right">Canceladas</TableHead>
                <TableHead className="text-right">Emitido</TableHead>
                <TableHead className="text-right">Proporcional</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...meses].reverse().map((m) => (
                <TableRow key={m.mes}>
                  <TableCell className="capitalize">{mesCorto(m.mes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.ordenes}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.pagadas}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.impagas}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.canceladas}</TableCell>
                  <TableCell className="text-right tabular-nums">{pesos(m.emitido)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pesos(m.proporcional)}
                    {m.diasProporcionales > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {m.diasProporcionales} días
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Seccion>

      <Seccion
        titulo="Trimestres iniciales"
        descripcion="Primeras altas que vencen en el período: si ya se negoció cómo siguen (con su orden) o si falta negociar."
        acciones={<Exportar reporte="trimestres" extra={periodo} />}
      >
        {trimestres.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vencen trimestres en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Paquete</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Continuidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trimestres.map((t) => (
                  <TableRow key={t.contratoId}>
                    <TableCell>
                      <Link
                        href={`/admin/clientes/${t.clienteId}`}
                        className="text-primary hover:underline"
                      >
                        {t.cliente}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{t.empresa}</span>
                    </TableCell>
                    <TableCell>{t.paquete}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {t.hasta ? fechaCorta(t.hasta) : "—"}
                    </TableCell>
                    <TableCell>
                      {t.renovacion !== null ? (
                        <Badge variant="outline" className="border-success/40 text-success">
                          Negociado · orden #{t.renovacion}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-warning/60 bg-warning/10">
                          Falta negociar
                        </Badge>
                      )}
                    </TableCell>
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
