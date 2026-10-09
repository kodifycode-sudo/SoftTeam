"use client";

import { Building2, Contact, CreditCard, MapPin, NotebookPen, Receipt } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  BotonEnviar,
  Campo,
  Casilla,
  FormularioConservado,
  MensajeFormulario,
  Selector,
} from "@/components/formulario";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { TIPOS_SOCIEDAD } from "@/lib/argentina";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { guardarClienteAccion } from "../acciones";

interface Domicilio {
  calle: string;
  ciudad: string;
  codigoPostal: string;
  provincia: string;
}
interface Contacto {
  nombre: string;
  email: string | null;
  telefono: string | null;
}

export interface DatosCliente {
  id: string;
  version: string;
  tipoPersona: "FISICA" | "JURIDICA";
  nombre: string;
  tipoSociedad: string | null;
  nombreFactura: string;
  cuit: string;
  condicionIva: string;
  domicilioFiscal: Domicilio;
  domicilioComercial: Domicilio | null;
  contactoAdministrador: Contacto;
  contactoPagos: Contacto | null;
  contactoComercial: Contacto | null;
  grupoId: string | null;
  medioPagoAltaId: string | null;
  medioPagoRenovacionId: string | null;
  modoFacturacion: number;
  emisorId: string | null;
  xubioId: string | null;
  observacionFactura: string | null;
  observaciones: string | null;
  activo: boolean;
}

export function Seccion({
  icono: Icono,
  titulo,
  descripcion,
  children,
}: {
  icono: typeof Receipt;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icono className="size-4 text-primary" /> {titulo}
        </CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

export function CamposDomicilio({
  prefijo,
  valor,
  estado,
  provincias,
}: {
  prefijo: string;
  valor: Domicilio | null;
  estado: EstadoFormulario;
  /** Provincias activas del país (una guardada que ya no está se sigue mostrando). */
  provincias: readonly string[];
}) {
  const opciones =
    valor?.provincia && !provincias.includes(valor.provincia)
      ? [valor.provincia, ...provincias]
      : provincias;
  return (
    <>
      <Campo
        nombre={`${prefijo}.calle`}
        etiqueta="Dirección"
        defaultValue={valor?.calle}
        estado={estado}
        className="sm:col-span-2"
      />
      <Campo
        nombre={`${prefijo}.ciudad`}
        etiqueta="Localidad"
        defaultValue={valor?.ciudad}
        estado={estado}
      />
      <Campo
        nombre={`${prefijo}.codigoPostal`}
        etiqueta="Código postal"
        defaultValue={valor?.codigoPostal}
        estado={estado}
      />
      <Selector
        nombre={`${prefijo}.provincia`}
        etiqueta="Provincia"
        estado={estado}
        valorInicial={valor?.provincia ?? ""}
      >
        <option value="">Elegí la provincia</option>
        {opciones.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Selector>
    </>
  );
}

export function CamposContacto({
  prefijo,
  valor,
  estado,
}: {
  prefijo: string;
  valor: Contacto | null;
  estado: EstadoFormulario;
}) {
  return (
    <>
      <Campo
        nombre={`${prefijo}.nombre`}
        etiqueta="Nombre"
        defaultValue={valor?.nombre}
        estado={estado}
      />
      <Campo
        nombre={`${prefijo}.email`}
        etiqueta="Mail"
        type="email"
        defaultValue={valor?.email ?? ""}
        estado={estado}
      />
      <Campo
        nombre={`${prefijo}.telefono`}
        etiqueta="Teléfono"
        type="tel"
        defaultValue={valor?.telefono ?? ""}
        estado={estado}
      />
    </>
  );
}

function AreaTexto({
  nombre,
  etiqueta,
  valor,
  estado,
  max,
}: {
  nombre: string;
  etiqueta: string;
  valor: string | null;
  estado: EstadoFormulario;
  max: number;
}) {
  const errores = estado.errores?.[nombre];
  const inicial = estado.valores?.[nombre] ?? valor ?? "";
  return (
    <Field data-invalid={errores ? true : undefined} className="sm:col-span-2">
      <FieldLabel htmlFor={`campo-${nombre}`}>{etiqueta}</FieldLabel>
      <Textarea
        key={inicial}
        id={`campo-${nombre}`}
        name={nombre}
        defaultValue={inicial}
        maxLength={max}
        rows={3}
      />
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}

export function FormularioCliente({
  cliente,
  grupos,
  medios,
  administracion,
  emisores,
  provincias,
  condicionesIva,
}: {
  cliente: DatosCliente;
  provincias: readonly string[];
  /** Activas del país, más la actual del cliente si se dio de baja. */
  condicionesIva: readonly { codigo: string; nombre: string }[];
  grupos: { id: string; nombre: string }[];
  medios: { id: string; nombre: string }[];
  /** CUIT y alta/baja solo los cambia Administración. */
  administracion: boolean;
  emisores: readonly { id: string; razonSocial: string; cuit: string }[];
}) {
  const [estado, accion] = useActionState(guardarClienteAccion, ESTADO_INICIAL);
  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      <input type="hidden" name="clienteId" value={cliente.id} />
      <input type="hidden" name="version" value={cliente.version} />
      <MensajeFormulario estado={estado} />

      <Seccion
        icono={Receipt}
        titulo="Datos fiscales"
        descripcion="Lo que sale en las facturas nuevas. Las órdenes ya emitidas conservan lo que tenían."
      >
        <Selector
          nombre="tipoPersona"
          etiqueta="Tipo de persona"
          estado={estado}
          valorInicial={cliente.tipoPersona}
        >
          <option value="JURIDICA">Persona jurídica</option>
          <option value="FISICA">Persona humana</option>
        </Selector>
        <Selector
          nombre="tipoSociedad"
          etiqueta="Tipo de sociedad"
          estado={estado}
          valorInicial={cliente.tipoSociedad ?? ""}
          ayuda="Solo para personas jurídicas."
        >
          <option value="">—</option>
          {TIPOS_SOCIEDAD.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Selector>
        <Campo
          nombre="nombre"
          etiqueta="Nombre o razón social"
          defaultValue={cliente.nombre}
          estado={estado}
        />
        <Campo
          nombre="nombreFactura"
          etiqueta="Nombre en la factura"
          defaultValue={cliente.nombreFactura}
          estado={estado}
        />
        <Campo
          nombre="cuit"
          etiqueta="CUIT / CUIL"
          defaultValue={formatearCuit(cliente.cuit)}
          readOnly={!administracion}
          ayuda={
            administracion
              ? "Cambiarlo es cambiar de persona jurídica: revisalo con Administración contable."
              : "Solo Administración puede cambiarlo."
          }
          estado={estado}
        />
        <Selector
          nombre="condicionIva"
          etiqueta="Condición frente al IVA"
          estado={estado}
          valorInicial={cliente.condicionIva}
          ayuda="Define si la factura es A o B."
        >
          {condicionesIva.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Campo
          nombre="xubioId"
          etiqueta="Código en Xubio (opcional)"
          defaultValue={cliente.xubioId ?? ""}
          estado={estado}
        />
      </Seccion>

      <Seccion icono={MapPin} titulo="Domicilio fiscal">
        <CamposDomicilio
          prefijo="domicilioFiscal"
          valor={cliente.domicilioFiscal}
          estado={estado}
          provincias={provincias}
        />
      </Seccion>

      <Seccion
        icono={Building2}
        titulo="Domicilio comercial"
        descripcion="Opcional: si lo dejás vacío, es el fiscal."
      >
        <CamposDomicilio
          prefijo="domicilioComercial"
          valor={cliente.domicilioComercial}
          estado={estado}
          provincias={provincias}
        />
      </Seccion>

      <Seccion
        icono={Contact}
        titulo="Contactos"
        descripcion="El administrador recibe los avisos de la cuenta; el de pagos, los de cobranza. Si no cargás uno, se usa el del administrador."
      >
        <p className="text-sm font-medium sm:col-span-2">Administrador</p>
        <CamposContacto
          prefijo="administrador"
          valor={cliente.contactoAdministrador}
          estado={estado}
        />
        <p className="text-sm font-medium sm:col-span-2">Pagos</p>
        <CamposContacto prefijo="pagos" valor={cliente.contactoPagos} estado={estado} />
        <p className="text-sm font-medium sm:col-span-2">Comercial</p>
        <CamposContacto prefijo="comercial" valor={cliente.contactoComercial} estado={estado} />
      </Seccion>

      <Seccion icono={CreditCard} titulo="Cobro">
        <Selector
          nombre="grupoId"
          etiqueta="Grupo económico"
          estado={estado}
          valorInicial={cliente.grupoId ?? ""}
        >
          <option value="">Sin grupo</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre}
            </option>
          ))}
        </Selector>
        <Selector
          nombre="modoFacturacion"
          etiqueta="Modo de facturación"
          estado={estado}
          valorInicial={String(cliente.modoFacturacion)}
          ayuda="Rige para las órdenes nuevas. Los medios de pago tienen que estar habilitados para el modo."
        >
          <option value="0">Pago directo</option>
          <option value="1">Factura adelantada</option>
          <option value="2">Suscripción de Mercado Pago</option>
          <option value="3">Factura agrupada con transferencia</option>
        </Selector>
        {administracion && (
          <Selector
            nombre="emisorId"
            etiqueta="Emisor"
            estado={estado}
            valorInicial={cliente.emisorId ?? ""}
            ayuda="Sociedad que le factura. Rige para las órdenes nuevas."
          >
            <option value="">El preferido del país</option>
            {emisores.map((e) => (
              <option key={e.id} value={e.id}>
                {e.razonSocial}
              </option>
            ))}
          </Selector>
        )}
        <Selector
          nombre="medioPagoAltaId"
          etiqueta="Medio de pago para compras"
          estado={estado}
          valorInicial={cliente.medioPagoAltaId ?? ""}
        >
          <option value="">El primero habilitado</option>
          {medios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Selector>
        <Selector
          nombre="medioPagoRenovacionId"
          etiqueta="Medio de pago para renovaciones"
          estado={estado}
          valorInicial={cliente.medioPagoRenovacionId ?? ""}
        >
          <option value="">El de compras</option>
          {medios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Selector>
      </Seccion>

      <Seccion icono={NotebookPen} titulo="Notas">
        <AreaTexto
          nombre="observacionFactura"
          etiqueta="Observación fija en las facturas"
          valor={cliente.observacionFactura}
          estado={estado}
          max={200}
        />
        <AreaTexto
          nombre="observaciones"
          etiqueta="Observaciones internas"
          valor={cliente.observaciones}
          estado={estado}
          max={2000}
        />
        <div className="sm:col-span-2">
          {!administracion && cliente.activo && <input type="hidden" name="activo" value="on" />}
          <Casilla
            nombre="activo"
            etiqueta="Cliente activo"
            descripcion={
              administracion
                ? "Un cliente inactivo no se renueva automáticamente ni puede recibir facturas de oficinas."
                : "Solo Administración puede darlo de baja."
            }
            marcada={cliente.activo}
            deshabilitada={!administracion}
          />
        </div>
      </Seccion>

      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={`/admin/clientes/${cliente.id}`}
          className={buttonVariants({ variant: "ghost" })}
        >
          Cancelar
        </Link>
        <BotonEnviar size="lg">Guardar cambios</BotonEnviar>
      </div>
    </FormularioConservado>
  );
}
