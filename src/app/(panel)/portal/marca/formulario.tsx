"use client";

import { ImageUp, Save, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  BotonEnviar,
  Campo,
  FormularioConservado,
  MensajeFormulario,
  useAvisoDeAccion,
} from "@/components/formulario";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COLOR_HEX, CONTRASTE_MINIMO, contraste, textoSobre } from "@/domain/cuentas/marca";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { guardarMarcaAccion } from "./acciones";

export interface DatosMarca {
  nombreComercial: string;
  eslogan: string;
  colorPrimario: string;
  colorSecundario: string;
  textoBienvenida: string;
  firmaMail: string;
  web: string;
  email: string;
  telefono: string;
  whatsapp: string;
  logoUrl: string | null;
}

const PRIMARIO = "#0f1b2d";
const SECUNDARIO = "#fbc02d";

function SelectorColor({
  nombre,
  etiqueta,
  valor,
  cambiar,
  porDefecto,
  estado,
}: {
  nombre: string;
  etiqueta: string;
  valor: string;
  cambiar: (v: string) => void;
  porDefecto: string;
  estado: EstadoFormulario;
}) {
  const errores = estado.errores?.[nombre];
  return (
    <Field data-invalid={errores ? true : undefined}>
      <FieldLabel htmlFor={nombre}>{etiqueta}</FieldLabel>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`Elegir ${etiqueta.toLowerCase()}`}
          value={COLOR_HEX.test(valor) ? valor : porDefecto}
          onChange={(e) => cambiar(e.target.value)}
          className="h-8 w-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
        />
        <Input
          id={nombre}
          name={nombre}
          value={valor}
          onChange={(e) => cambiar(e.target.value)}
          placeholder={porDefecto}
          maxLength={7}
          className="font-mono"
          aria-invalid={errores ? true : undefined}
        />
      </div>
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}

/** Cómo se vería el portal del asegurado con esta marca. */
function VistaPrevia({ m, logo }: { m: DatosMarca; logo: string | null }) {
  const primario = COLOR_HEX.test(m.colorPrimario) ? m.colorPrimario : PRIMARIO;
  const secundario = COLOR_HEX.test(m.colorSecundario) ? m.colorSecundario : SECUNDARIO;
  const nombre = m.nombreComercial || "Tu broker";
  return (
    <section className="overflow-hidden rounded-2xl border shadow-sm" aria-label="Vista previa">
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ background: primario, color: textoSobre(primario) }}
      >
        {logo ? (
          // biome-ignore lint/performance/noImgElement: vista previa de un archivo local (blob:), no se optimiza.
          <img
            src={logo}
            alt="Logo"
            className="size-11 rounded-lg bg-white/90 object-contain p-1"
          />
        ) : (
          <span className="grid size-11 place-items-center rounded-lg bg-white/15 text-lg font-bold">
            {nombre.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{nombre}</p>
          {m.eslogan && <p className="truncate text-xs opacity-80">{m.eslogan}</p>}
        </div>
      </div>
      <div className="space-y-4 bg-card p-5">
        <p className="text-sm">
          {m.textoBienvenida || "Hola, Juan. Acá tenés tus pólizas, cuotas y siniestros al día."}
        </p>
        <span
          className="inline-flex rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: secundario, color: textoSobre(secundario) }}
        >
          Ver mis pólizas
        </span>
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {[m.telefono, m.whatsapp && `WhatsApp ${m.whatsapp}`, m.email, m.web]
            .filter(Boolean)
            .join(" · ") || "Tus datos de contacto aparecen acá."}
        </p>
      </div>
    </section>
  );
}

export function FormularioMarca({ inicial }: { inicial: DatosMarca }) {
  const [estado, accion] = useActionState(guardarMarcaAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  const [m, setM] = useState(inicial);
  const [logoLocal, setLogoLocal] = useState<string | null>(null);
  const [quitarLogo, setQuitarLogo] = useState(false);
  const cambiar = (campo: keyof DatosMarca) => (valor: string) =>
    setM((x) => ({ ...x, [campo]: valor }));

  // Tras guardar, el servidor manda la marca actualizada (con la URL del logo nueva).
  useEffect(() => {
    setM(inicial);
    setLogoLocal(null);
    setQuitarLogo(false);
  }, [inicial]);
  // Libera la URL local del archivo elegido.
  useEffect(
    () => () => {
      if (logoLocal) URL.revokeObjectURL(logoLocal);
    },
    [logoLocal],
  );

  const primario = COLOR_HEX.test(m.colorPrimario) ? m.colorPrimario : PRIMARIO;
  const poco = contraste(primario, textoSobre(primario)) < CONTRASTE_MINIMO;
  const logo = quitarLogo ? null : (logoLocal ?? m.logoUrl);
  const errorLogo = estado.errores?.logo;

  return (
    <FormularioConservado
      accion={accion}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
      noValidate
    >
      <div className="space-y-6">
        {!estado.ok && <MensajeFormulario estado={estado} />}
        <Card>
          <CardHeader>
            <CardTitle>Identidad</CardTitle>
            <CardDescription>
              Nombre, logo y colores con los que te ven tus asegurados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  nombre="nombreComercial"
                  etiqueta="Nombre comercial"
                  maxLength={80}
                  value={m.nombreComercial}
                  onChange={(e) => cambiar("nombreComercial")(e.target.value)}
                  estado={estado}
                />
                <Campo
                  nombre="eslogan"
                  etiqueta="Eslogan"
                  maxLength={120}
                  value={m.eslogan}
                  onChange={(e) => cambiar("eslogan")(e.target.value)}
                  estado={estado}
                />
              </div>
              <Field data-invalid={errorLogo ? true : undefined}>
                <FieldLabel htmlFor="logo">Logo</FieldLabel>
                <Input
                  id="logo"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-invalid={errorLogo ? true : undefined}
                  onChange={(e) => {
                    const archivo = e.target.files?.[0];
                    setLogoLocal(archivo ? URL.createObjectURL(archivo) : null);
                    if (archivo) setQuitarLogo(false);
                  }}
                />
                <FieldDescription className="flex items-center gap-1.5">
                  <ImageUp className="size-3.5" /> PNG, JPG o WebP, hasta 300 KB. Mejor cuadrado y
                  con fondo transparente.
                </FieldDescription>
                <FieldError errors={errorLogo?.map((message) => ({ message }))} />
                {m.logoUrl && (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="quitarLogo"
                      name="quitarLogo"
                      value="on"
                      checked={quitarLogo}
                      onCheckedChange={setQuitarLogo}
                    />
                    <FieldLabel htmlFor="quitarLogo" className="font-normal">
                      Quitar el logo actual
                    </FieldLabel>
                  </Field>
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectorColor
                  nombre="colorPrimario"
                  etiqueta="Color principal"
                  valor={m.colorPrimario}
                  cambiar={cambiar("colorPrimario")}
                  porDefecto={PRIMARIO}
                  estado={estado}
                />
                <SelectorColor
                  nombre="colorSecundario"
                  etiqueta="Color de acento"
                  valor={m.colorSecundario}
                  cambiar={cambiar("colorSecundario")}
                  porDefecto={SECUNDARIO}
                  estado={estado}
                />
              </div>
              {poco && (
                <p className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm">
                  <TriangleAlert className="size-4 shrink-0 text-[oklch(0.5_0.13_70)]" /> Con ese
                  color principal el texto se lee con dificultad. Probá uno más oscuro o más claro.
                </p>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Textos y contacto</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="textoBienvenida">Mensaje de bienvenida</FieldLabel>
                <Textarea
                  id="textoBienvenida"
                  name="textoBienvenida"
                  rows={3}
                  maxLength={500}
                  value={m.textoBienvenida}
                  onChange={(e) => cambiar("textoBienvenida")(e.target.value)}
                />
                <FieldDescription>Lo ven tus asegurados al entrar a BienSeguro.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="firmaMail">Firma de los mails</FieldLabel>
                <Textarea
                  id="firmaMail"
                  name="firmaMail"
                  rows={2}
                  maxLength={300}
                  defaultValue={inicial.firmaMail}
                  key={inicial.firmaMail}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  nombre="telefono"
                  etiqueta="Teléfono"
                  type="tel"
                  value={m.telefono}
                  onChange={(e) => cambiar("telefono")(e.target.value)}
                  estado={estado}
                />
                <Campo
                  nombre="whatsapp"
                  etiqueta="WhatsApp"
                  type="tel"
                  value={m.whatsapp}
                  onChange={(e) => cambiar("whatsapp")(e.target.value)}
                  estado={estado}
                />
                <Campo
                  nombre="email"
                  etiqueta="Mail de contacto"
                  type="email"
                  value={m.email}
                  onChange={(e) => cambiar("email")(e.target.value)}
                  estado={estado}
                />
                <Campo
                  nombre="web"
                  etiqueta="Sitio web"
                  type="url"
                  placeholder="https://"
                  value={m.web}
                  onChange={(e) => cambiar("web")(e.target.value)}
                  estado={estado}
                />
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <BotonEnviar size="lg">
            <Save data-icon="inline-start" /> Guardar marca
          </BotonEnviar>
        </div>
      </div>

      <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <p className="text-sm font-medium">Vista previa</p>
        <VistaPrevia m={m} logo={logo} />
        <p className="text-xs text-muted-foreground">
          Así se muestra en BienSeguro y en los avisos a tus asegurados. Cada producto la adapta a
          su diseño.
        </p>
      </div>
    </FormularioConservado>
  );
}
