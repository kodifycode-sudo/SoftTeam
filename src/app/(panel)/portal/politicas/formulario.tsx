"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  Casilla,
  FormularioConservado,
  useAvisoDeAccion,
} from "@/components/formulario";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import type { Politicas } from "@/server/db/schema/configuracion";
import { guardarPoliticasAccion } from "./acciones";

export function FormularioPoliticas({ politicas }: { politicas: Politicas }) {
  const [estado, accion] = useActionState(guardarPoliticasAccion, ESTADO_INICIAL);
  const [sinTope, setSinTope] = useState(politicas.topeMensualPozoPorOficina === null);
  useAvisoDeAccion(estado);

  return (
    <FormularioConservado accion={accion} className="grid gap-6 lg:grid-cols-2" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones y consumos</CardTitle>
          <CardDescription>
            Cómo usan las oficinas los créditos de notificaciones y cotizaciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Casilla
            nombre="oficinasNotifican"
            etiqueta="Las oficinas envían notificaciones a sus asegurados"
            marcada={politicas.oficinasNotifican}
          />
          <Casilla
            nombre="oficinasUsanPozoEmpresa"
            etiqueta="Si una oficina agota lo suyo, usa el saldo de la empresa"
            descripcion="Primero consume sus propios paquetes; después, el saldo común."
            marcada={politicas.oficinasUsanPozoEmpresa}
          />
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <Campo
              nombre="topeMensualPozoPorOficina"
              etiqueta="Tope mensual por oficina sobre el saldo de la empresa"
              type="number"
              min={0}
              inputMode="numeric"
              ayuda="Créditos por mes que cada oficina puede tomar del saldo común."
              disabled={sinTope}
              defaultValue={
                politicas.topeMensualPozoPorOficina === null
                  ? ""
                  : String(politicas.topeMensualPozoPorOficina)
              }
              estado={estado}
            />
            <Field orientation="horizontal">
              <Checkbox
                id="sinTope"
                name="sinTope"
                value="on"
                checked={sinTope}
                onCheckedChange={setSinTope}
              />
              <FieldLabel htmlFor="sinTope" className="font-normal">
                Sin tope
              </FieldLabel>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compras</CardTitle>
          <CardDescription>Quién puede contratar paquetes además de la empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Casilla
            nombre="oficinasContratan"
            etiqueta="Las oficinas con administrador propio contratan sus paquetes"
            descripcion="El paquete queda asignado a la oficina y se puede facturar a otro cliente."
            marcada={politicas.oficinasContratan}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end lg:col-span-2">
        <BotonEnviar size="lg">
          <Save data-icon="inline-start" /> Guardar políticas
        </BotonEnviar>
      </div>
    </FormularioConservado>
  );
}
