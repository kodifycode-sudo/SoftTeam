"use client";

import { CircleAlert, CircleCheck, FileSearch, Upload } from "lucide-react";
import { useActionState, useRef } from "react";
import { BotonEnviar, Casilla } from "@/components/formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type EstadoImportacion, importarAccion } from "./acciones";

function Resumen({ resultado }: { resultado: NonNullable<EstadoImportacion["resultado"]> }) {
  const r = resultado;
  if (r.errorGeneral) {
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>No se puede leer el archivo</AlertTitle>
        <AlertDescription>{r.errorGeneral}</AlertDescription>
      </Alert>
    );
  }
  const conErrores = r.errores.length > 0;
  return (
    <div className="space-y-4">
      {conErrores ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {r.errores.length + r.erroresOmitidos} fila
            {r.errores.length + r.erroresOmitidos === 1 ? "" : "s"} con errores: no se importó nada
          </AlertTitle>
          <AlertDescription>
            Corregí el archivo y volvé a revisarlo. La importación es todo o nada, para no dejar
            datos a medias.
          </AlertDescription>
        </Alert>
      ) : r.confirmado ? (
        <Alert className="border-success/30 bg-success/5 text-success">
          <CircleCheck />
          <AlertTitle>Importación terminada</AlertTitle>
          <AlertDescription className="text-success">
            {r.creados} nuevos, {r.actualizados} actualizados y {r.existentes} que ya estaban.
            {r.invitacionesEnviadas > 0 &&
              ` Enviamos el acceso a ${r.invitacionesEnviadas} administrador${r.invitacionesEnviadas === 1 ? "" : "es"}.`}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-primary/20 bg-primary/5">
          <FileSearch className="text-primary" />
          <AlertTitle>Revisión sin errores: todavía no se guardó nada</AlertTitle>
          <AlertDescription>
            Se van a crear {r.creados}, actualizar {r.actualizados} y {r.existentes} ya están. Si
            está bien, tocá "Importar".
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Filas", r.filas],
          ["Nuevos", r.creados],
          ["Actualizados", r.actualizados],
          ["Ya estaban", r.existentes],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta} className="rounded-xl border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
            <dd className="text-xl font-semibold tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-muted-foreground">
        Separador: <strong>{r.separador}</strong>. Columnas reconocidas:{" "}
        {r.reconocidas.map((c) => c.titulo).join(", ") || "ninguna"}.
        {r.ignoradas.length > 0 && ` Se ignoran: ${r.ignoradas.join(", ")}.`}
      </p>

      {conErrores && (
        <Card className="overflow-hidden p-0">
          <Table aria-label="Errores por fila">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-20 pl-4">Línea</TableHead>
                <TableHead>Problema</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.errores.map((e) => (
                <TableRow key={`${e.linea}-${e.mensaje}`}>
                  <TableCell className="pl-4 tabular-nums">{e.linea}</TableCell>
                  <TableCell className="whitespace-normal">{e.mensaje}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {r.erroresOmitidos > 0 && (
            <p className="border-t p-3 text-sm text-muted-foreground">
              Y {r.erroresOmitidos} errores más.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

export function FormularioImportacion({
  tipo,
  conAdministradores,
}: {
  tipo: string;
  /** El tipo crea administradores: se ofrece enviarles el acceso por mail. */
  conAdministradores: boolean;
}) {
  const [estado, accion] = useActionState(importarAccion, {});
  const formulario = useRef<HTMLFormElement>(null);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-4 text-primary" /> Archivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formulario} action={accion} className="space-y-4">
            <input type="hidden" name="tipo" value={tipo} />
            <Field>
              <FieldLabel htmlFor="archivo">Archivo (.csv o .txt)</FieldLabel>
              <Input
                id="archivo"
                name="archivo"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                required
              />
              <FieldDescription>
                Texto separado por <Badge variant="outline">;</Badge> (también coma o tabulador),
                con los títulos en la primera línea. UTF-8 o como lo guarda Excel. Hasta 4 MB.
              </FieldDescription>
            </Field>
            {conAdministradores && (
              <Casilla
                nombre="invitar"
                etiqueta="Enviar el acceso por mail a los administradores nuevos"
                descripcion="Si no lo marcás, pueden entrar igual con ¿Olvidaste tu contraseña?"
                marcada={false}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <BotonEnviar name="modo" value="revisar" variant="outline">
                <FileSearch data-icon="inline-start" /> Revisar
              </BotonEnviar>
              <BotonEnviar name="modo" value="importar">
                <Upload data-icon="inline-start" /> Importar
              </BotonEnviar>
            </div>
          </form>
        </CardContent>
      </Card>
      {estado.mensaje && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{estado.mensaje}</AlertDescription>
        </Alert>
      )}
      {estado.resultado && <Resumen resultado={estado.resultado} />}
    </div>
  );
}
