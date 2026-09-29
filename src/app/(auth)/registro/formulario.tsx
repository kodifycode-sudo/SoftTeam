"use client";

import { Building2, Check, KeyRound, MapPin, UserRound, X } from "lucide-react";
import { type ReactNode, useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  FormularioConservado,
  MensajeFormulario,
} from "@/components/formulario";
import { SelectNativo } from "@/components/select-nativo";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { CONDICIONES_IVA_ETIQUETA, TIPOS_SOCIEDAD } from "@/lib/argentina";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { cn } from "@/lib/utils";
import { registrarse } from "../acciones";

function Seccion({
  icono,
  titulo,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          {icono}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function CampoSelect({
  nombre,
  etiqueta,
  estado,
  opciones,
  placeholder,
}: {
  nombre: string;
  etiqueta: string;
  estado: EstadoFormulario;
  opciones: readonly (readonly [string, string])[];
  placeholder: string;
}) {
  const errores = estado.errores?.[nombre];
  return (
    <Field data-invalid={errores ? true : undefined}>
      <FieldLabel htmlFor={`campo-${nombre}`}>{etiqueta}</FieldLabel>
      <SelectNativo
        id={`campo-${nombre}`}
        name={nombre}
        defaultValue={estado.valores?.[nombre] ?? ""}
        aria-invalid={errores ? true : undefined}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {opciones.map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </SelectNativo>
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}

const REQUISITOS = [
  { texto: "10 caracteres o más", cumple: (c: string) => c.length >= 10 },
  { texto: "Una mayúscula", cumple: (c: string) => /[A-Z]/.test(c) },
  { texto: "Una minúscula", cumple: (c: string) => /[a-z]/.test(c) },
  { texto: "Un número", cumple: (c: string) => /\d/.test(c) },
];

export function FormularioRegistro({ provincias }: { provincias: readonly string[] }) {
  const [estado, accion] = useActionState(registrarse, ESTADO_INICIAL);
  const [tipoPersona, setTipoPersona] = useState(estado.valores?.tipoPersona ?? "JURIDICA");
  const [contrasena, setContrasena] = useState("");
  const juridica = tipoPersona === "JURIDICA";

  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      <MensajeFormulario estado={estado} />
      <Card>
        <CardContent className="space-y-8">
          <Seccion icono={<UserRound className="size-4" />} titulo="Titular">
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="sr-only">Tipo de persona</legend>
              {(
                [
                  ["JURIDICA", "Empresa", "SA, SRL, SAS…", Building2],
                  ["FISICA", "Persona humana", "Productor independiente", UserRound],
                ] as const
              ).map(([valor, titulo, detalle, Icono]) => (
                <label
                  key={valor}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50",
                    tipoPersona === valor && "border-primary bg-primary/5 ring-1 ring-primary/30",
                  )}
                >
                  <input
                    type="radio"
                    name="tipoPersona"
                    value={valor}
                    checked={tipoPersona === valor}
                    onChange={() => setTipoPersona(valor)}
                    className="sr-only"
                  />
                  <Icono
                    className={cn(
                      "mt-0.5 size-5 shrink-0",
                      tipoPersona === valor ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span>
                    <span className="block text-sm font-medium">{titulo}</span>
                    <span className="block text-xs text-muted-foreground">{detalle}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              {juridica && (
                <>
                  <Campo
                    nombre="razonSocial"
                    etiqueta="Razón social"
                    placeholder="Broker del Sur SRL"
                    autoComplete="organization"
                    estado={estado}
                  />
                  <CampoSelect
                    nombre="tipoSociedad"
                    etiqueta="Tipo de sociedad"
                    placeholder="Elegí…"
                    opciones={TIPOS_SOCIEDAD.map((t) => [t, t] as const)}
                    estado={estado}
                  />
                </>
              )}
              <Campo
                nombre="nombre"
                etiqueta={juridica ? "Apellido y nombre del administrador" : "Apellido y nombre"}
                placeholder="Pérez, Ana"
                autoComplete="name"
                estado={estado}
              />
              <Campo
                nombre="cuit"
                etiqueta={juridica ? "CUIT" : "CUIT / CUIL"}
                placeholder="30-71234567-1"
                inputMode="numeric"
                ayuda="Con o sin guiones."
                estado={estado}
              />
              <CampoSelect
                nombre="condicionIva"
                etiqueta="Condición frente al IVA"
                placeholder="Elegí…"
                opciones={Object.entries(CONDICIONES_IVA_ETIQUETA)}
                estado={estado}
              />
              <Campo
                nombre="telefono"
                etiqueta="Teléfono / WhatsApp"
                type="tel"
                placeholder="+54 11 4444-5555"
                autoComplete="tel"
                estado={estado}
              />
            </FieldGroup>
          </Seccion>

          <Seccion icono={<MapPin className="size-4" />} titulo="Domicilio fiscal">
            <FieldGroup className="grid gap-4 sm:grid-cols-6">
              <Campo
                nombre="calle"
                etiqueta="Dirección"
                placeholder="Av. Corrientes 1234, piso 5"
                autoComplete="street-address"
                className="sm:col-span-6"
                estado={estado}
              />
              <Campo
                nombre="ciudad"
                etiqueta="Localidad"
                autoComplete="address-level2"
                className="sm:col-span-3"
                estado={estado}
              />
              <Campo
                nombre="codigoPostal"
                etiqueta="Código postal"
                autoComplete="postal-code"
                className="sm:col-span-3"
                estado={estado}
              />
              <div className="sm:col-span-6">
                <CampoSelect
                  nombre="provincia"
                  etiqueta="Provincia"
                  placeholder="Elegí la provincia…"
                  opciones={provincias.map((p) => [p, p] as const)}
                  estado={estado}
                />
              </div>
            </FieldGroup>
          </Seccion>

          <Seccion icono={<KeyRound className="size-4" />} titulo="Acceso">
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Campo
                nombre="email"
                etiqueta="Mail"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="nombre@tubroker.com.ar"
                ayuda="Vas a ingresar con este mail. Te mandamos un código para confirmarlo."
                className="sm:col-span-2"
                estado={estado}
              />
              <Campo
                nombre="password"
                etiqueta="Contraseña"
                type="password"
                autoComplete="new-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                estado={{ ...estado, valores: undefined }}
              />
              <Campo
                nombre="confirmacion"
                etiqueta="Repetí la contraseña"
                type="password"
                autoComplete="new-password"
                estado={{ ...estado, valores: undefined }}
              />
            </FieldGroup>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
              {REQUISITOS.map(({ texto, cumple }) => {
                const ok = cumple(contrasena);
                return (
                  <li
                    key={texto}
                    className={cn(
                      "flex items-center gap-1.5",
                      ok ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {ok ? <Check className="size-3.5" /> : <X className="size-3.5 opacity-50" />}
                    {texto}
                  </li>
                );
              })}
            </ul>
          </Seccion>

          <div className="space-y-3 border-t pt-6">
            <Field orientation="horizontal">
              <Checkbox
                id="aceptaNotificaciones"
                name="aceptaNotificaciones"
                value="on"
                defaultChecked
              />
              <FieldLabel htmlFor="aceptaNotificaciones" className="font-normal">
                Quiero recibir novedades y avisos de vencimiento por mail.
              </FieldLabel>
            </Field>
            <Field
              orientation="horizontal"
              data-invalid={estado.errores?.aceptaTerminos ? true : undefined}
            >
              <Checkbox id="aceptaTerminos" name="aceptaTerminos" value="on" />
              <FieldLabel htmlFor="aceptaTerminos" className="font-normal">
                Acepto las condiciones de uso y el tratamiento de mis datos.
              </FieldLabel>
            </Field>
            <FieldError errors={estado.errores?.aceptaTerminos?.map((message) => ({ message }))} />
          </div>
        </CardContent>
      </Card>
      <BotonEnviar size="lg" className="w-full sm:w-auto sm:px-6">
        Crear cuenta y continuar
      </BotonEnviar>
    </FormularioConservado>
  );
}
