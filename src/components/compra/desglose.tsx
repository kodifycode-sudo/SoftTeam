import type { ReactNode } from "react";
import { pesos, porcentajeTexto } from "@/lib/formato";
import { cn } from "@/lib/utils";

export interface ImportesDesglose {
  subtotalLista: bigint;
  bonificacionTotal: bigint;
  subtotal: bigint;
  ticketPorcentaje: bigint;
  ticketDescuento: bigint;
  baseNeta: bigint;
  ajustePagoPorcentaje: bigint;
  ajustePago: bigint;
  netoGravado: bigint;
  alicuotaIva: bigint;
  iva: bigint;
  total: bigint;
}

function Fila({
  etiqueta,
  valor,
  tono,
  fuerte,
}: {
  etiqueta: ReactNode;
  valor: bigint;
  tono?: "positivo" | "negativo";
  fuerte?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", fuerte && "font-medium")}>
      <dt className={fuerte ? undefined : "text-muted-foreground"}>{etiqueta}</dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums whitespace-nowrap",
          tono === "negativo" && "text-success",
          tono === "positivo" && "text-foreground",
        )}
      >
        {tono === "negativo" && valor > 0n ? "− " : ""}
        {pesos(valor < 0n ? -valor : valor)}
      </dd>
    </div>
  );
}

/**
 * Desglose de importes de una orden, en el orden de la cascada de cálculo.
 * Se usa igual en el carrito y en la vista de la orden: el cliente ve la
 * misma fórmula antes y después de confirmar.
 */
export function DesgloseOrden({
  importes,
  codigoTicket,
}: {
  importes: ImportesDesglose;
  codigoTicket?: string | null;
}) {
  const i = importes;
  return (
    <dl className="space-y-2.5 text-sm">
      {i.bonificacionTotal > 0n && (
        <>
          <Fila etiqueta="Precio de lista" valor={i.subtotalLista} />
          <Fila etiqueta="Bonificación" valor={i.bonificacionTotal} tono="negativo" />
        </>
      )}
      <Fila etiqueta="Subtotal" valor={i.subtotal} fuerte />
      {i.ticketDescuento > 0n && (
        <Fila
          etiqueta={`Descuento${codigoTicket ? ` ${codigoTicket}` : ""} (${porcentajeTexto(i.ticketPorcentaje)})`}
          valor={i.ticketDescuento}
          tono="negativo"
        />
      )}
      {i.ajustePago !== 0n && (
        <Fila
          etiqueta={`${i.ajustePago < 0n ? "Bonificación" : "Recargo"} por medio de pago (${porcentajeTexto(
            i.ajustePagoPorcentaje < 0n ? -i.ajustePagoPorcentaje : i.ajustePagoPorcentaje,
          )})`}
          valor={i.ajustePago < 0n ? -i.ajustePago : i.ajustePago}
          tono={i.ajustePago < 0n ? "negativo" : "positivo"}
        />
      )}
      <div className="border-t pt-2.5">
        <Fila etiqueta="Neto gravado" valor={i.netoGravado} />
      </div>
      <Fila etiqueta={`IVA ${porcentajeTexto(i.alicuotaIva)}`} valor={i.iva} />
      <div className="flex items-baseline justify-between gap-4 border-t pt-3">
        <dt className="font-semibold">Total</dt>
        <dd className="text-2xl font-semibold tracking-tight tabular-nums">{pesos(i.total)}</dd>
      </div>
    </dl>
  );
}
