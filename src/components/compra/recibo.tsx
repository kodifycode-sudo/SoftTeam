import { DesgloseOrden } from "@/components/compra/desglose";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { fechaCorta, pesos } from "@/lib/formato";
import { EMISOR } from "@/server/emisor";
import type { Recibo } from "@/server/modules/ventas/recibo";
import { BotonImprimir } from "./imprimir";

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

/**
 * Recibo provisorio imprimible (o para guardar como PDF): constancia del pago
 * de una orden hasta que se emite su factura. No es un comprobante fiscal.
 */
export function VistaRecibo({ recibo }: { recibo: Recibo }) {
  const { orden, medio, lineas, facturacion, empresa, ticket } = recibo;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex justify-end print:hidden">
        <BotonImprimir />
      </div>
      <article className="space-y-8 rounded-2xl border bg-card p-6 sm:p-10 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
          <div className="space-y-1">
            <p className="text-lg font-semibold">{EMISOR.marca}</p>
            <p className="text-sm text-muted-foreground">{EMISOR.razonSocial}</p>
            {EMISOR.cuit && (
              <p className="text-sm text-muted-foreground">CUIT {formatearCuit(EMISOR.cuit)}</p>
            )}
            {EMISOR.domicilio && (
              <p className="text-sm text-muted-foreground">{EMISOR.domicilio}</p>
            )}
            <p className="text-sm text-muted-foreground">{EMISOR.email}</p>
          </div>
          <div className="space-y-1 text-right">
            <h1 className="text-xl font-semibold">Recibo provisorio</h1>
            <p className="font-mono text-sm">{recibo.numeroRecibo}</p>
            <p className="text-sm text-muted-foreground">{fechaCorta(recibo.pagadoEn)}</p>
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Recibimos de
            </p>
            <p className="font-medium">{facturacion?.nombreFactura}</p>
            {facturacion && <p>CUIT {formatearCuit(facturacion.cuit)}</p>}
            {empresa && (
              <p className="text-muted-foreground">
                Empresa {empresa.nombre} · #{empresa.numero}
              </p>
            )}
          </div>
          <div className="space-y-1 text-sm sm:text-right">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              En concepto de
            </p>
            <p className="font-medium">Pago de la orden #{orden.numero}</p>
            <p>
              {medio.nombre} · {fechaHora(recibo.pagadoEn)}
            </p>
            {orden.mpPagoId && <p className="text-muted-foreground">Operación {orden.mpPagoId}</p>}
          </div>
        </section>

        <section className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Paquete</th>
                <th className="py-2 text-right font-medium">Importe con impuestos</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2">{l.descripcion}</td>
                  <td className="py-2 text-right tabular-nums">{pesos(l.totalProrrateado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto max-w-sm">
            <DesgloseOrden importes={orden} codigoTicket={ticket?.codigo} />
          </div>
        </section>

        <footer className="space-y-1 border-t pt-6 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Documento no válido como factura.</p>
          <p>
            {orden.facturaNumero
              ? `La factura ${orden.facturaNumero} corresponde a este pago.`
              : `La factura ${orden.tipoComprobante} de este pago se emite a nombre de ${facturacion?.nombreFactura ?? "quien factura"} y se envía por mail.`}
          </p>
        </footer>
      </article>
    </div>
  );
}
