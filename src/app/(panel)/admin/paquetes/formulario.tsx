"use client";

import { CalendarRange, Layers, Plus, Save, Tags, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  BotonEnviar,
  Campo,
  FormularioConservado,
  MensajeFormulario,
} from "@/components/formulario";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { productoUI } from "@/lib/productos";
import { cn } from "@/lib/utils";
import { guardarPaqueteAccion } from "./acciones";

export interface RecursoFormulario {
  recursoId: string;
  nombre: string;
  unidad: string | null;
  clase: "CAPACIDAD" | "FUNCION" | "CUPO_MENSUAL" | "SALDO";
}

export interface ProductoFormulario {
  productoId: string;
  nombre: string;
  recursos: RecursoFormulario[];
}

export interface AlternativaFormulario {
  id?: string;
  clave: string;
  nombre: string;
  meses: string;
  precioCompra: string;
  precioRenovacion: string;
  activa: boolean;
}

export interface PaqueteFormulario {
  id?: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: "TEMPORAL" | "CONSUMIBLE";
  privado: boolean;
  activo: boolean;
  ventaDesde: string;
  ventaHasta: string;
  recursos: Record<string, number>;
  alternativas: AlternativaFormulario[];
}

/**
 * `clave` identifica la fila en React. La inicial es fija (se renderiza en el
 * servidor y en el navegador: debe coincidir); las agregadas después nacen solo
 * en el cliente y pueden ser aleatorias.
 */
const nuevaAlternativa = (
  tipo: PaqueteFormulario["tipo"],
  clave: string = crypto.randomUUID(),
): AlternativaFormulario => ({
  clave,
  nombre: tipo === "TEMPORAL" ? "Mensual" : "Pago único",
  meses: tipo === "TEMPORAL" ? "1" : "",
  precioCompra: "",
  precioRenovacion: "",
  activa: true,
});

const errorDe = (estado: EstadoFormulario, clave: string) =>
  estado.errores?.[clave]?.map((message) => ({ message }));

export function FormularioPaquete({
  productos,
  inicial,
}: {
  productos: ProductoFormulario[];
  inicial: PaqueteFormulario;
}) {
  const [estado, accion] = useActionState(guardarPaqueteAccion, ESTADO_INICIAL);
  const [tipo, setTipo] = useState(inicial.tipo);
  const [alternativas, setAlternativas] = useState(
    inicial.alternativas.length
      ? inicial.alternativas
      : [nuevaAlternativa(inicial.tipo, "inicial")],
  );
  const idForm = useId();

  const cambiarAlternativa = (clave: string, cambio: Partial<AlternativaFormulario>) =>
    setAlternativas((lista) => lista.map((a) => (a.clave === clave ? { ...a, ...cambio } : a)));

  const recursoVisible = (r: RecursoFormulario) =>
    tipo === "CONSUMIBLE" ? r.clase === "SALDO" : r.clase !== "SALDO";

  const alternativasJson = JSON.stringify(
    alternativas.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      meses: tipo === "CONSUMIBLE" || a.meses === "" ? null : a.meses,
      precioCompra: a.precioCompra,
      precioRenovacion: a.precioRenovacion || a.precioCompra,
      activa: a.activa,
    })),
  );

  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate id={idForm}>
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      <input type="hidden" name="alternativas" value={alternativasJson} />
      <MensajeFormulario estado={estado} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="size-4 text-primary" /> Datos del paquete
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Tipo</legend>
            {(
              [
                ["TEMPORAL", "Temporal", "Vence por fecha. Usuarios, límites y cupos mensuales."],
                [
                  "CONSUMIBLE",
                  "Consumible",
                  "Saldo prepago sin vencimiento que se agota con el uso.",
                ],
              ] as const
            ).map(([valor, titulo, detalle]) => (
              <label
                key={valor}
                className={cn(
                  "cursor-pointer rounded-xl border p-4 transition-colors hover:bg-muted/50",
                  tipo === valor && "border-primary bg-primary/5 ring-1 ring-primary/30",
                )}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={valor}
                  checked={tipo === valor}
                  onChange={() => {
                    setTipo(valor);
                    setAlternativas((lista) =>
                      lista.map((a) => ({
                        ...a,
                        meses: valor === "CONSUMIBLE" ? "" : a.meses || "1",
                      })),
                    );
                  }}
                  className="sr-only"
                />
                <span className="block font-medium">{titulo}</span>
                <span className="block text-sm text-muted-foreground">{detalle}</span>
              </label>
            ))}
          </fieldset>

          <FieldGroup className="grid gap-4 sm:grid-cols-3">
            <Campo
              nombre="codigo"
              etiqueta="Código"
              defaultValue={inicial.codigo}
              placeholder="PRO-FULL"
              className="sm:col-span-1"
              ayuda="Único. Letras, números y guiones."
              estado={estado}
            />
            <Campo
              nombre="nombre"
              etiqueta="Nombre"
              defaultValue={inicial.nombre}
              placeholder="Prodigal Full"
              className="sm:col-span-2"
              estado={estado}
            />
            <Field className="sm:col-span-3">
              <FieldLabel htmlFor="descripcion">Descripción</FieldLabel>
              <Textarea
                id="descripcion"
                name="descripcion"
                defaultValue={inicial.descripcion}
                rows={2}
                placeholder="Para quién es y qué resuelve."
              />
            </Field>
          </FieldGroup>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <CalendarRange className="size-4 text-muted-foreground" /> Período de venta
              </p>
              <FieldGroup className="grid grid-cols-2 gap-3">
                <Campo
                  nombre="ventaDesde"
                  etiqueta="Desde"
                  type="date"
                  defaultValue={inicial.ventaDesde}
                  estado={estado}
                />
                <Campo
                  nombre="ventaHasta"
                  etiqueta="Hasta"
                  type="date"
                  defaultValue={inicial.ventaHasta}
                  ayuda="Vacío: sin fin."
                  estado={estado}
                />
              </FieldGroup>
            </div>
            <div className="space-y-4 rounded-xl border p-4">
              <Field orientation="horizontal">
                <Switch id="activo" name="activo" defaultChecked={inicial.activo} />
                <FieldLabel htmlFor="activo" className="flex-col items-start gap-0">
                  <span>A la venta</span>
                  <FieldDescription>
                    Se ofrece a los clientes dentro del período de venta.
                  </FieldDescription>
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Switch id="privado" name="privado" defaultChecked={inicial.privado} />
                <FieldLabel htmlFor="privado" className="flex-col items-start gap-0">
                  <span>Privado</span>
                  <FieldDescription>
                    Solo SOFTeam lo ve y lo asigna (acuerdos especiales).
                  </FieldDescription>
                </FieldLabel>
              </Field>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4 text-primary" /> Límites que incluye
          </CardTitle>
          <CardDescription>
            Cantidades por unidad contratada. Si el cliente compra 2 unidades, se duplican.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {productos.map((producto) => {
            const visibles = producto.recursos.filter(recursoVisible);
            if (visibles.length === 0) return null;
            const ui = productoUI(producto.productoId);
            return (
              <section key={producto.productoId} className="rounded-xl border p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("grid size-7 place-items-center rounded-lg", ui.clase)}>
                    <ui.icono className="size-4" />
                  </span>
                  {producto.nombre}
                </h3>
                <div className="space-y-3">
                  {visibles.map((r) =>
                    r.clase === "FUNCION" ? (
                      <Field key={r.recursoId} orientation="horizontal">
                        <Checkbox
                          id={`r-${r.recursoId}`}
                          name={`recurso:${r.recursoId}`}
                          value="1"
                          defaultChecked={(inicial.recursos[r.recursoId] ?? 0) > 0}
                        />
                        <FieldLabel htmlFor={`r-${r.recursoId}`} className="font-normal">
                          {r.nombre}
                        </FieldLabel>
                      </Field>
                    ) : (
                      <div key={r.recursoId} className="flex items-center justify-between gap-3">
                        <label htmlFor={`r-${r.recursoId}`} className="text-sm">
                          {r.nombre}
                        </label>
                        <div className="flex shrink-0 items-center gap-2">
                          <Input
                            id={`r-${r.recursoId}`}
                            name={`recurso:${r.recursoId}`}
                            type="number"
                            min={0}
                            inputMode="numeric"
                            defaultValue={inicial.recursos[r.recursoId] || ""}
                            placeholder="0"
                            className="w-28 text-right tabular-nums"
                          />
                          <span className="w-20 truncate text-xs text-muted-foreground">
                            {r.unidad}
                          </span>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alternativas de precio</CardTitle>
          <CardDescription>
            Precios netos, sin IVA. La renovación puede tener otro precio (si la dejás vacía, se usa
            el de compra).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldError errors={errorDe(estado, "alternativas")} />
          {alternativas.map((a, i) => (
            <div
              key={a.clave}
              className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-12 sm:items-end"
            >
              <Field
                className="sm:col-span-3"
                data-invalid={errorDe(estado, `alternativas.${i}.nombre`) ? true : undefined}
              >
                <FieldLabel htmlFor={`alt-${a.clave}-nombre`}>Alternativa</FieldLabel>
                <Input
                  id={`alt-${a.clave}-nombre`}
                  value={a.nombre}
                  onChange={(e) => cambiarAlternativa(a.clave, { nombre: e.target.value })}
                />
                <FieldError errors={errorDe(estado, `alternativas.${i}.nombre`)} />
              </Field>
              {tipo === "TEMPORAL" && (
                <Field
                  className="sm:col-span-2"
                  data-invalid={errorDe(estado, `alternativas.${i}.meses`) ? true : undefined}
                >
                  <FieldLabel htmlFor={`alt-${a.clave}-meses`}>Meses</FieldLabel>
                  <Input
                    id={`alt-${a.clave}-meses`}
                    type="number"
                    min={1}
                    max={60}
                    inputMode="numeric"
                    value={a.meses}
                    onChange={(e) => cambiarAlternativa(a.clave, { meses: e.target.value })}
                  />
                  <FieldError errors={errorDe(estado, `alternativas.${i}.meses`)} />
                </Field>
              )}
              <Field
                className={tipo === "TEMPORAL" ? "sm:col-span-3" : "sm:col-span-4"}
                data-invalid={errorDe(estado, `alternativas.${i}.precioCompra`) ? true : undefined}
              >
                <FieldLabel htmlFor={`alt-${a.clave}-compra`}>Precio de compra</FieldLabel>
                <Input
                  id={`alt-${a.clave}-compra`}
                  inputMode="decimal"
                  placeholder="38000"
                  value={a.precioCompra}
                  onChange={(e) => cambiarAlternativa(a.clave, { precioCompra: e.target.value })}
                  className="tabular-nums"
                />
                <FieldError errors={errorDe(estado, `alternativas.${i}.precioCompra`)} />
              </Field>
              <Field className={tipo === "TEMPORAL" ? "sm:col-span-3" : "sm:col-span-4"}>
                <FieldLabel htmlFor={`alt-${a.clave}-renovacion`}>Precio de renovación</FieldLabel>
                <Input
                  id={`alt-${a.clave}-renovacion`}
                  inputMode="decimal"
                  placeholder={a.precioCompra || "Igual al de compra"}
                  value={a.precioRenovacion}
                  onChange={(e) =>
                    cambiarAlternativa(a.clave, { precioRenovacion: e.target.value })
                  }
                  className="tabular-nums"
                />
              </Field>
              <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                <Switch
                  checked={a.activa}
                  onCheckedChange={(activa) => cambiarAlternativa(a.clave, { activa })}
                  aria-label="Alternativa activa"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Quitar alternativa"
                  disabled={alternativas.length === 1}
                  onClick={() =>
                    setAlternativas((lista) => lista.filter((x) => x.clave !== a.clave))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setAlternativas((l) => [...l, nuevaAlternativa(tipo)])}
          >
            <Plus data-icon="inline-start" /> Agregar alternativa
          </Button>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-30 -mx-4 flex items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Link href="/admin/paquetes" className={buttonVariants({ variant: "ghost" })}>
          Cancelar
        </Link>
        <BotonEnviar size="lg">
          <Save data-icon="inline-start" /> Guardar paquete
        </BotonEnviar>
      </div>
    </FormularioConservado>
  );
}
