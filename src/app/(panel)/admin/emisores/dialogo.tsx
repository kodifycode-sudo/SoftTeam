"use client";

import { Pencil, Plus } from "lucide-react";
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
import { ESTADO_INICIAL } from "@/lib/formulario";
import { guardarEmisorAccion } from "./acciones";

export interface DatosEmisor {
  id: string;
  razonSocial: string;
  cuit: string;
  condicionIva: string;
  domicilioFiscal: string;
  paisId: string;
  puntoVenta: number | null;
  preferido: boolean;
  activo: boolean;
  xubio: boolean;
  xubioClientId: string | null;
  xubioSecretoCargado: boolean;
  xubioPuntoVentaId: number | null;
  xubioProductoId: number | null;
  xubioCentroCostoId: number | null;
  mercadoPago: boolean;
  mpAccessTokenCargado: boolean;
  mpSecretoAvisosCargado: boolean;
}

interface Opciones {
  condiciones: { codigo: string; nombre: string }[];
  paises: { id: string; nombre: string }[];
}

const numero = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const secreto = (cargado: boolean | undefined) =>
  cargado ? "Cargado: dejalo vacío para conservarlo" : "Sin cargar";

function Formulario({
  emisor,
  opciones,
  cerrar,
}: {
  emisor?: DatosEmisor;
  opciones: Opciones;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(guardarEmisorAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  const clave = emisor?.id ?? "nuevo";
  return (
    <FormularioConservado accion={accion} className="space-y-5" noValidate>
      {emisor && <input type="hidden" name="id" value={emisor.id} />}
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          nombre="razonSocial"
          etiqueta="Razón social"
          defaultValue={emisor?.razonSocial}
          estado={estado}
        />
        <Campo nombre="cuit" etiqueta="CUIT" defaultValue={emisor?.cuit} estado={estado} />
        <Selector
          nombre="condicionIva"
          etiqueta="Condición frente al IVA"
          estado={estado}
          valorInicial={emisor?.condicionIva ?? opciones.condiciones[0]?.codigo ?? ""}
        >
          {opciones.condiciones.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Selector
          nombre="paisId"
          etiqueta="País"
          estado={estado}
          valorInicial={emisor?.paisId ?? "AR"}
        >
          {opciones.paises.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Selector>
      </div>
      <Campo
        nombre="domicilioFiscal"
        etiqueta="Domicilio fiscal"
        defaultValue={emisor?.domicilioFiscal}
        estado={estado}
      />
      <Campo
        nombre="puntoVenta"
        etiqueta="Punto de venta de ARCA"
        inputMode="numeric"
        defaultValue={numero(emisor?.puntoVenta)}
        estado={estado}
      />
      <div className="space-y-2">
        <Casilla
          id={`emisor-preferido-${clave}`}
          nombre="preferido"
          etiqueta="Preferido: se propone a los clientes nuevos del país"
          marcada={emisor?.preferido ?? false}
        />
        <Casilla
          id={`emisor-activo-${clave}`}
          nombre="activo"
          etiqueta="Activo"
          marcada={emisor?.activo ?? true}
        />
      </div>

      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Xubio (facturación electrónica)</legend>
        <Casilla
          id={`emisor-xubio-${clave}`}
          nombre="xubio"
          etiqueta="Factura con Xubio (sin Xubio, las facturas se registran a mano)"
          marcada={emisor?.xubio ?? false}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            nombre="xubioClientId"
            etiqueta="Client ID"
            defaultValue={emisor?.xubioClientId ?? ""}
            estado={estado}
          />
          <Campo
            nombre="xubioSecreto"
            etiqueta="Secret ID"
            type="password"
            autoComplete="off"
            placeholder={secreto(emisor?.xubioSecretoCargado)}
            estado={estado}
          />
          <Campo
            nombre="xubioPuntoVentaId"
            etiqueta="Punto de venta (id de Xubio)"
            inputMode="numeric"
            defaultValue={numero(emisor?.xubioPuntoVentaId)}
            estado={estado}
          />
          <Campo
            nombre="xubioProductoId"
            etiqueta="Producto (id de Xubio)"
            inputMode="numeric"
            defaultValue={numero(emisor?.xubioProductoId)}
            estado={estado}
          />
          <Campo
            nombre="xubioCentroCostoId"
            etiqueta="Centro de costo (opcional)"
            inputMode="numeric"
            defaultValue={numero(emisor?.xubioCentroCostoId)}
            estado={estado}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Mercado Pago</legend>
        <Casilla
          id={`emisor-mp-${clave}`}
          nombre="mercadoPago"
          etiqueta="Cobra con Mercado Pago (sin conexión no se ofrecen el link ni la suscripción)"
          marcada={emisor?.mercadoPago ?? false}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            nombre="mpAccessToken"
            etiqueta="Access token"
            type="password"
            autoComplete="off"
            placeholder={secreto(emisor?.mpAccessTokenCargado)}
            estado={estado}
          />
          <Campo
            nombre="mpSecretoAvisos"
            etiqueta="Clave de las notificaciones"
            type="password"
            autoComplete="off"
            placeholder={secreto(emisor?.mpSecretoAvisosCargado)}
            estado={estado}
          />
        </div>
      </fieldset>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Guardar</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

/** Alta o edición de un emisor. Las credenciales no se muestran nunca. */
export function DialogoEmisor({ emisor, opciones }: { emisor?: DatosEmisor; opciones: Opciones }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {emisor ? (
        <DialogTrigger
          render={<Button variant="ghost" size="sm" aria-label={`Editar ${emisor.razonSocial}`} />}
        >
          <Pencil data-icon="inline-start" /> Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus data-icon="inline-start" /> Nuevo emisor
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{emisor ? emisor.razonSocial : "Nuevo emisor"}</DialogTitle>
          <DialogDescription>
            Sociedad de SOFTeam que factura. Cada cliente tiene un emisor y sus órdenes se facturan
            y cobran con la cuenta de ese emisor.
          </DialogDescription>
        </DialogHeader>
        {abierto && (
          <Formulario emisor={emisor} opciones={opciones} cerrar={() => setAbierto(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
