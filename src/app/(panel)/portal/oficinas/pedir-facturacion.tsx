"use client";

import { Clock, Receipt } from "lucide-react";
import { useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  FormularioConservado,
  MensajeFormulario,
  useAvisoDeAccion,
} from "@/components/formulario";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { cancelarPedidoFacturacionAccion, pedirFacturacionAccion } from "./acciones";

function Contenido({ oficinaId, cerrar }: { oficinaId: string; cerrar: () => void }) {
  const [estado, accion] = useActionState(pedirFacturacionAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-5" noValidate>
      <input type="hidden" name="oficinaId" value={oficinaId} />
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Campo
        nombre="cuit"
        etiqueta="CUIT a facturar"
        placeholder="30-12345678-9"
        inputMode="numeric"
        ayuda="Tiene que estar registrado en STLic. Vacío: volver a facturar a la empresa."
        estado={estado}
      />
      <Campo
        nombre="comentario"
        etiqueta="Comentario para SOFTeam (opcional)"
        maxLength={300}
        estado={estado}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Enviar pedido</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

/**
 * Pedir a SOFTeam que otra razón social pague la oficina, o ver (y retirar)
 * el pedido pendiente. Es un solo componente para que el diálogo siga montado
 * cuando el pedido se crea y la confirmación llegue a mostrarse.
 */
export function FacturacionDeOficina({
  oficinaId,
  oficina,
  pedido,
}: {
  oficinaId: string;
  oficina: string;
  pedido: { id: string; cuit: string | null } | null;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {pedido ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-xs">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            Pediste facturar a {pedido.cuit ? formatearCuit(pedido.cuit) : "la empresa"} · esperando
            a SOFTeam
          </span>
          <form action={cancelarPedidoFacturacionAccion}>
            <input type="hidden" name="id" value={pedido.id} />
            <Button type="submit" variant="ghost" size="sm">
              Retirar pedido
            </Button>
          </form>
        </div>
      ) : (
        <div className="border-t pt-3">
          <DialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                aria-label={`Pedir cambio de facturación de ${oficina}`}
              />
            }
          >
            <Receipt data-icon="inline-start" /> Cambiar facturación
          </DialogTrigger>
        </div>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Facturación de {oficina}</DialogTitle>
          <DialogDescription>
            Si otra razón social paga las compras de esta oficina, pedí que se le facturen a ella.
            SOFTeam lo revisa y te avisa.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido oficinaId={oficinaId} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
