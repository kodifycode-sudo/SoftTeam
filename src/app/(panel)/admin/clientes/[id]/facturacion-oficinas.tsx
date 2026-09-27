"use client";

import { Check, Clock, MapPinned, Pencil, Receipt, X } from "lucide-react";
import { useActionState, useState } from "react";
import { BotonEnviar, Campo, useAvisoDeAccion } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { asignarFacturacionOficinaAccion, resolverPedidoFacturacionAccion } from "./acciones";

export interface OficinaFacturacion {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  cliente: { numero: number; nombreFactura: string; cuit: string; activo: boolean } | null;
  /** Pedido pendiente de la empresa para esta oficina. */
  pedido: {
    id: string;
    cuit: string | null;
    comentario: string | null;
    solicitadoPor: string;
    clienteRegistrado: string | null;
  } | null;
}

/** Pedido de la empresa: SOFTeam lo aprueba (aplica el cambio) o lo rechaza con motivo. */
/**
 * Queda montado aunque no haya pedido: al resolverlo, el pedido desaparece
 * de la página y el aviso igual tiene que mostrarse.
 */
function PedidoDeOficina({
  pedido,
  clienteId,
  editable,
}: {
  pedido: OficinaFacturacion["pedido"];
  clienteId: string;
  editable: boolean;
}) {
  const [estado, accion] = useActionState(resolverPedidoFacturacionAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  if (!pedido) return null;
  return (
    <Pedido
      key={pedido.id}
      pedido={pedido}
      clienteId={clienteId}
      editable={editable}
      estado={estado}
      accion={accion}
    />
  );
}

function Pedido({
  pedido,
  clienteId,
  editable,
  estado,
  accion,
}: {
  pedido: NonNullable<OficinaFacturacion["pedido"]>;
  clienteId: string;
  editable: boolean;
  estado: EstadoFormulario;
  accion: (formData: FormData) => void;
}) {
  const [rechazando, setRechazando] = useState(false);
  return (
    <form
      action={accion}
      className="mt-3 space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm"
      noValidate
    >
      <input type="hidden" name="solicitudId" value={pedido.id} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <p className="flex items-center gap-1.5 font-medium">
        <Clock className="size-4" /> {pedido.solicitadoPor} pide facturar a{" "}
        {pedido.cuit ? formatearCuit(pedido.cuit) : "la empresa"}
      </p>
      {pedido.cuit && (
        <p className="text-xs text-muted-foreground">
          {pedido.clienteRegistrado
            ? `Cliente de STLic: ${pedido.clienteRegistrado}`
            : "Ese CUIT todavía no es cliente de STLic: tiene que registrarse antes de aprobar."}
        </p>
      )}
      {pedido.comentario && <p className="text-xs italic">"{pedido.comentario}"</p>}
      {editable && (
        <>
          {rechazando && (
            <Campo
              nombre="respuesta"
              etiqueta="Motivo del rechazo (lo ve la empresa)"
              maxLength={300}
              estado={estado}
            />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {rechazando ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRechazando(false)}
                >
                  Volver
                </Button>
                <BotonEnviar size="sm" variant="destructive" name="decision" value="rechazar">
                  Rechazar pedido
                </BotonEnviar>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRechazando(true)}>
                  <X data-icon="inline-start" /> Rechazar
                </Button>
                <BotonEnviar
                  size="sm"
                  name="decision"
                  value="aprobar"
                  disabled={Boolean(pedido.cuit) && !pedido.clienteRegistrado}
                >
                  <Check data-icon="inline-start" /> Aprobar
                </BotonEnviar>
              </>
            )}
          </div>
        </>
      )}
    </form>
  );
}

function Editor({
  oficina,
  clienteId,
  cerrar,
}: {
  oficina: OficinaFacturacion;
  clienteId: string;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(asignarFacturacionOficinaAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <form action={accion} className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3" noValidate>
      <input type="hidden" name="oficinaId" value={oficina.id} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <Campo
        nombre="cliente"
        etiqueta="Facturar a (CUIT o número de cliente)"
        placeholder="30-12345678-9"
        ayuda="Tiene que ser un cliente de STLic activo. Vacío: el cliente de la empresa."
        defaultValue={oficina.cliente ? formatearCuit(oficina.cliente.cuit) : ""}
        estado={estado}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={cerrar}>
          Cancelar
        </Button>
        <BotonEnviar size="sm">Guardar</BotonEnviar>
      </div>
    </form>
  );
}

/**
 * Compra delegada: a quién se facturan las compras de cada oficina. Solo
 * Administración y Comercial lo cambian; las órdenes ya emitidas no cambian.
 */
export function FacturacionOficinas({
  oficinas,
  clienteId,
  editable,
}: {
  oficinas: OficinaFacturacion[];
  clienteId: string;
  editable: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Receipt className="size-4 text-muted-foreground" /> Facturación de la compra delegada
      </p>
      <ul className="divide-y rounded-lg border">
        {oficinas.map((o) => (
          <li key={o.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <MapPinned className="size-3.5 text-muted-foreground" />
                  <span className="font-mono text-xs">{o.codigo}</span> {o.nombre}
                  {!o.activa && <Badge variant="outline">Inactiva</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.cliente ? (
                    <>
                      Factura a{" "}
                      <strong className="text-foreground">{o.cliente.nombreFactura}</strong> ·{" "}
                      {formatearCuit(o.cliente.cuit)} · cliente #{o.cliente.numero}
                      {!o.cliente.activo && " (inactivo: se factura a la empresa)"}
                    </>
                  ) : (
                    "Factura al cliente de la empresa"
                  )}
                </p>
              </div>
              {editable && editando !== o.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditando(o.id)}
                  aria-label={`Cambiar facturación de ${o.codigo} ${o.nombre}`}
                >
                  <Pencil data-icon="inline-start" /> Cambiar
                </Button>
              )}
            </div>
            {editando === o.id && (
              <Editor oficina={o} clienteId={clienteId} cerrar={() => setEditando(null)} />
            )}
            <PedidoDeOficina pedido={o.pedido} clienteId={clienteId} editable={editable} />
          </li>
        ))}
      </ul>
    </div>
  );
}
