"use client";

import { TicketPlus } from "lucide-react";
import { useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  Casilla,
  FormularioConservado,
  MensajeFormulario,
  Selector,
  useAvisoDeAccion,
} from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { crearTicketAccion } from "./acciones";

interface Opciones {
  paquetes: { id: string; nombre: string }[];
  paises: { id: string; nombre: string }[];
  hoy: string;
}

function ContenidoNuevoTicket({
  paquetes,
  paises,
  hoy,
  cerrar,
}: Opciones & { cerrar: () => void }) {
  const [estado, accion] = useActionState(crearTicketAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="codigo"
            etiqueta="Código"
            placeholder="BIENVENIDA"
            ayuda="Lo que escribe el cliente en el carrito."
            estado={estado}
          />
          <Campo nombre="descripcion" etiqueta="Descripción (opcional)" estado={estado} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="porcentaje"
            etiqueta="Descuento (%)"
            inputMode="decimal"
            placeholder="20"
            estado={estado}
          />
          <Campo
            nombre="tope"
            etiqueta="Tope ($)"
            inputMode="decimal"
            placeholder="50000"
            ayuda="Descuento máximo acumulado: funciona como saldo en las renovaciones. Vacío o 0, sin tope."
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector nombre="uso" etiqueta="Usos" estado={estado} valorInicial="UNICO_X_CLIENTE">
            <option value="UNICO_X_CLIENTE">Una vez por cliente</option>
            <option value="UNICO_ABSOLUTO">Una sola vez en total</option>
            <option value="MULTIPLE">Varias veces</option>
          </Selector>
          <Campo
            nombre="usosMaximos"
            etiqueta="Máximo de usos (varias veces)"
            inputMode="numeric"
            placeholder="0"
            ayuda="Solo si se usa varias veces. Vacío o 0, sin límite."
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="minimo"
            etiqueta="Compra mínima ($)"
            inputMode="decimal"
            placeholder="0"
            ayuda="Subtotal mínimo de la orden. Vacío o 0, sin mínimo."
            estado={estado}
          />
          <Selector nombre="paisId" etiqueta="País" estado={estado} valorInicial="">
            <option value="">Todos</option>
            {paises.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="cliente"
            etiqueta="Para un cliente (opcional)"
            placeholder="CUIT o número de cliente"
            ayuda="Ticket nominado: el carrito del cliente lo propone en su próxima compra."
            estado={estado}
          />
          <Campo
            nombre="observaciones"
            etiqueta="Observaciones internas"
            ayuda="Obligatorias si es para un cliente: la situación que lo origina."
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="vigenteDesde"
            etiqueta="Se puede usar desde"
            type="date"
            defaultValue={hoy}
            estado={estado}
          />
          <Campo nombre="vigenteHasta" etiqueta="Hasta" type="date" estado={estado} />
        </div>
      </FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">Se puede usar en</FieldLegend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Casilla nombre="altaInicial" etiqueta="El primer alta" marcada />
          <Casilla nombre="adicional" etiqueta="Altas adicionales" marcada />
          <Casilla nombre="renovacion" etiqueta="Renovaciones" marcada />
        </div>
        <Casilla
          nombre="publico"
          etiqueta="Público: el cliente lo puede ingresar en el carrito"
          descripcion="Sin marcar, solo lo aplica SOFTeam en la orden manual."
          marcada
        />
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">Paquetes</FieldLegend>
        <FieldDescription>
          Sin elegir ninguno, aplica a todos. Si elegís algunos, todos los paquetes de la orden
          tienen que estar en la lista.
        </FieldDescription>
        <div className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
          {paquetes.map((p) => (
            <Field key={p.id} orientation="horizontal">
              <Checkbox id={`paquete-${p.id}`} name="paquetes" value={p.id} />
              <FieldLabel htmlFor={`paquete-${p.id}`} className="font-normal">
                {p.nombre}
              </FieldLabel>
            </Field>
          ))}
        </div>
      </FieldSet>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Crear ticket</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function NuevoTicket(props: Opciones) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" />}>
        <TicketPlus data-icon="inline-start" /> Nuevo ticket
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo ticket de descuento</DialogTitle>
          <DialogDescription>
            Un porcentaje con tope. Acompaña a las renovaciones de la orden durante 12 meses o hasta
            agotar el tope. No aplica a la factura agrupada ni sobre paquetes bonificados.
          </DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoNuevoTicket {...props} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
