"use client";

import { Calculator, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DesgloseOrden } from "@/components/compra/desglose";
import { SelectNativo } from "@/components/select-nativo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { pesos } from "@/lib/formato";
import {
  type CotizacionManual,
  confirmarOrdenManualAccion,
  cotizarOrdenManualAccion,
  type PedidoOrdenManual,
} from "./acciones";

export interface OpcionPaquete {
  alternativaId: string;
  etiqueta: string;
  consumible: boolean;
  /** Saldo que trae por unidad (consumibles). */
  saldo: number;
}

export interface OpcionRenovable {
  contratoId: string;
  etiqueta: string;
  trimestreInicial: boolean;
  alternativas: { id: string; nombre: string }[];
}

type Linea = PedidoOrdenManual["items"][number] & { clave: string; etiqueta: string };

let secuencia = 0;
const nuevaClave = () => `l${++secuencia}`;

export function FormularioOrdenManual({
  clienteId,
  empresaId,
  paquetes,
  renovables,
  medios,
  emisores,
  diasVenc,
}: {
  clienteId: string;
  empresaId: string;
  paquetes: OpcionPaquete[];
  renovables: OpcionRenovable[];
  medios: { id: string; nombre: string }[];
  emisores: { id: string; nombre: string }[];
  diasVenc: number[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [elegido, setElegido] = useState(paquetes[0]?.alternativaId ?? "");
  const [opciones, setOpciones] = useState({
    medioPagoId: "",
    ticketCodigo: "",
    diaVenc: "",
    fechaDesde: "",
    emisorId: "",
  });
  const [cotizacion, setCotizacion] = useState<CotizacionManual | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState(() => crypto.randomUUID());

  // Cualquier cambio invalida el cálculo anterior.
  const cambiar = (fn: () => void) => {
    fn();
    setCotizacion(null);
    setError(null);
  };
  const editar = (claveLinea: string, cambios: Partial<Linea>) =>
    cambiar(() =>
      setLineas((ls) => ls.map((l) => (l.clave === claveLinea ? { ...l, ...cambios } : l))),
    );
  const pedido = (): PedidoOrdenManual => ({
    empresaId,
    items: lineas.map(({ clave: _c, etiqueta: _e, ...l }) => l),
    ...opciones,
  });

  const agregarPaquete = () => {
    const p = paquetes.find((x) => x.alternativaId === elegido);
    if (!p) return;
    cambiar(() =>
      setLineas((ls) => [
        ...ls,
        {
          clave: nuevaClave(),
          etiqueta: p.etiqueta,
          alternativaId: p.alternativaId,
          cantidad: "1",
          bonificacion: "",
          recurrente: false,
          motivo: "",
          cantidadSaldo: "",
        },
      ]),
    );
  };
  const agregarRenovacion = (r: OpcionRenovable, alternativaId: string) => {
    const alt = r.alternativas.find((a) => a.id === alternativaId);
    if (!alt) return;
    cambiar(() =>
      setLineas((ls) => [
        ...ls.filter((l) => l.contratoAnteriorId !== r.contratoId),
        {
          clave: nuevaClave(),
          etiqueta: `Renovación de ${r.etiqueta} · ${alt.nombre}`,
          alternativaId: alt.id,
          contratoAnteriorId: r.contratoId,
          cantidad: "1",
          bonificacion: "",
          recurrente: false,
          motivo: "",
          cantidadSaldo: "",
        },
      ]),
    );
  };

  const calcular = () =>
    iniciar(async () => {
      const r = await cotizarOrdenManualAccion(pedido());
      if (r.ok) {
        setCotizacion(r.cotizacion);
        setError(null);
      } else {
        setCotizacion(null);
        setError(r.mensaje);
      }
    });
  const confirmar = () =>
    iniciar(async () => {
      const r = await confirmarOrdenManualAccion({
        ...pedido(),
        claveIdempotencia: clave,
        clienteId,
      });
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
      toast.success(r.mensaje);
      setClave(crypto.randomUUID());
      router.push(r.ordenId ? `/admin/ordenes/${r.ordenId}` : `/admin/clientes/${clienteId}`);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Paquetes</CardTitle>
            <CardDescription>
              Incluye los privados. La bonificación pide motivo; un consumible bonificado al 100 %
              permite editar su saldo y no se renueva.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <SelectNativo
                  aria-label="Paquete a agregar"
                  value={elegido}
                  onChange={(e) => setElegido(e.target.value)}
                >
                  {paquetes.map((p) => (
                    <option key={p.alternativaId} value={p.alternativaId}>
                      {p.etiqueta}
                    </option>
                  ))}
                </SelectNativo>
              </div>
              <Button type="button" variant="secondary" onClick={agregarPaquete}>
                <Plus data-icon="inline-start" /> Agregar
              </Button>
            </div>

            {lineas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no agregaste paquetes.</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {lineas.map((l) => {
                  const paquete = paquetes.find((p) => p.alternativaId === l.alternativaId);
                  const cien = Number(l.bonificacion.replace(",", ".")) >= 100;
                  return (
                    <li key={l.clave} className="space-y-3 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{l.etiqueta}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Quitar ${l.etiqueta}`}
                          onClick={() =>
                            cambiar(() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave)))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {!l.contratoAnteriorId && (
                          <Field>
                            <FieldLabel htmlFor={`cantidad-${l.clave}`}>Cantidad</FieldLabel>
                            <Input
                              id={`cantidad-${l.clave}`}
                              inputMode="numeric"
                              value={l.cantidad}
                              onChange={(e) => editar(l.clave, { cantidad: e.target.value })}
                            />
                          </Field>
                        )}
                        <Field>
                          <FieldLabel htmlFor={`bonif-${l.clave}`}>Bonificación (%)</FieldLabel>
                          <Input
                            id={`bonif-${l.clave}`}
                            inputMode="decimal"
                            placeholder="0"
                            value={l.bonificacion}
                            onChange={(e) => editar(l.clave, { bonificacion: e.target.value })}
                          />
                        </Field>
                        {paquete?.consumible && cien && (
                          <Field>
                            <FieldLabel htmlFor={`saldo-${l.clave}`}>Unidades de saldo</FieldLabel>
                            <Input
                              id={`saldo-${l.clave}`}
                              inputMode="numeric"
                              placeholder={String(paquete.saldo * Number(l.cantidad || 1))}
                              value={l.cantidadSaldo}
                              onChange={(e) => editar(l.clave, { cantidadSaldo: e.target.value })}
                            />
                          </Field>
                        )}
                      </div>
                      {l.bonificacion.trim() !== "" && Number(l.bonificacion) !== 0 && (
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                          <Field>
                            <FieldLabel htmlFor={`motivo-${l.clave}`}>Motivo</FieldLabel>
                            <Input
                              id={`motivo-${l.clave}`}
                              value={l.motivo}
                              onChange={(e) => editar(l.clave, { motivo: e.target.value })}
                            />
                          </Field>
                          {!cien && (
                            <Field orientation="horizontal">
                              <Checkbox
                                id={`recurrente-${l.clave}`}
                                checked={l.recurrente}
                                onCheckedChange={(v) => editar(l.clave, { recurrente: v === true })}
                              />
                              <FieldLabel htmlFor={`recurrente-${l.clave}`} className="font-normal">
                                Recurrente
                              </FieldLabel>
                            </Field>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {renovables.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="size-4 text-primary" /> Renovar a mano
              </CardTitle>
              <CardDescription>
                Incluye el trimestre inicial: elegí el período y, abajo, el día de vencimiento. La
                orden cobra los días proporcionales más el período.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {renovables.map((r) => (
                  <li
                    key={r.contratoId}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <p className="min-w-0 flex-1 text-sm">
                      {r.etiqueta}
                      {r.trimestreInicial && (
                        <span className="block text-xs text-muted-foreground">
                          Trimestre inicial a negociar
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      {r.alternativas.map((a) => (
                        <Button
                          key={a.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => agregarRenovacion(r, a.id)}
                        >
                          {a.nombre}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Condiciones</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="medio">Medio de pago</FieldLabel>
              <SelectNativo
                id="medio"
                value={opciones.medioPagoId}
                onChange={(e) =>
                  cambiar(() => setOpciones((o) => ({ ...o, medioPagoId: e.target.value })))
                }
              >
                <option value="">El preferido del cliente</option>
                {medios.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </SelectNativo>
            </Field>
            <Field>
              <FieldLabel htmlFor="dia">Día de vencimiento</FieldLabel>
              <SelectNativo
                id="dia"
                value={opciones.diaVenc}
                onChange={(e) =>
                  cambiar(() => setOpciones((o) => ({ ...o, diaVenc: e.target.value })))
                }
              >
                <option value="">El propuesto</option>
                {diasVenc.map((d) => (
                  <option key={d} value={d}>
                    Día {d}
                  </option>
                ))}
              </SelectNativo>
            </Field>
            <Field>
              <FieldLabel htmlFor="ticket">Ticket</FieldLabel>
              <Input
                id="ticket"
                className="font-mono uppercase"
                value={opciones.ticketCodigo}
                onChange={(e) =>
                  cambiar(() => setOpciones((o) => ({ ...o, ticketCodigo: e.target.value })))
                }
              />
              <FieldDescription>Incluye los que solo aplica SOFTeam.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="emisor">Emisor</FieldLabel>
              <SelectNativo
                id="emisor"
                value={opciones.emisorId}
                onChange={(e) =>
                  cambiar(() => setOpciones((o) => ({ ...o, emisorId: e.target.value })))
                }
              >
                <option value="">El del cliente</option>
                {emisores.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </SelectNativo>
            </Field>
            <Field>
              <FieldLabel htmlFor="desde">Fecha desde (alta a grupo)</FieldLabel>
              <Input
                id="desde"
                type="date"
                value={opciones.fechaDesde}
                onChange={(e) =>
                  cambiar(() => setOpciones((o) => ({ ...o, fechaDesde: e.target.value })))
                }
              />
              <FieldDescription>Inicio del tramo. Vacío: hoy.</FieldDescription>
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
          {cotizacion && (
            <CardDescription>
              {cotizacion.medio} · Factura {cotizacion.comprobante} a {cotizacion.facturaA} · Emite{" "}
              {cotizacion.emisor}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {cotizacion ? (
            <>
              <ul className="space-y-1.5 text-sm">
                {cotizacion.lineas.map((l) => (
                  <li key={l.descripcion} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{l.descripcion}</span>
                    <span className="shrink-0 tabular-nums">{pesos(l.precioFinal)}</span>
                  </li>
                ))}
              </ul>
              <DesgloseOrden
                importes={cotizacion.importes}
                codigoTicket={cotizacion.codigoTicket}
              />
              <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                {cotizacion.situacion}
                {cotizacion.importes.total === 0n &&
                  " Sin importe: queda pagada en el acto, sin link ni factura."}
              </p>
              <Button
                type="button"
                size="lg"
                className="h-11 w-full"
                disabled={pendiente}
                onClick={confirmar}
              >
                <ShieldCheck data-icon="inline-start" /> Confirmar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={pendiente || lineas.length === 0}
              onClick={calcular}
            >
              <Calculator data-icon="inline-start" /> Calcular
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
