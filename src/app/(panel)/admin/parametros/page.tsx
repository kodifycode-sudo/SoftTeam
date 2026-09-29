import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { type ClaveParametro, leerParametros, PARAMETROS } from "@/server/modules/parametros";
import { FormularioParametro } from "./formulario";

export const metadata: Metadata = { title: "Parámetros" };

export default async function PaginaParametros() {
  const { rol } = await requerirSofteam(["ADMINISTRACION", "SOPORTE"]);
  const valores = await leerParametros(await obtenerDb());
  const claves = Object.keys(PARAMETROS) as ClaveParametro[];
  const grupos = [...new Set(claves.map((c) => PARAMETROS[c].grupo))];

  return (
    <>
      <EncabezadoPagina
        titulo="Parámetros del sistema"
        descripcion="Rigen desde el próximo proceso, sin desplegar. Cada cambio queda en la auditoría."
      />
      <div className="grid max-w-4xl gap-6">
        {grupos.map((grupo) => (
          <Card key={grupo}>
            <CardHeader>
              <CardTitle>{grupo}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {claves
                .filter((c) => PARAMETROS[c].grupo === grupo)
                .map((clave) => {
                  const p = PARAMETROS[clave];
                  const valor = valores[clave];
                  return (
                    <FormularioParametro
                      key={clave}
                      clave={clave}
                      etiqueta={p.etiqueta}
                      ayuda={p.ayuda}
                      tipo={p.tipo}
                      valor={
                        Array.isArray(valor)
                          ? valor.join(", ")
                          : typeof valor === "boolean"
                            ? valor
                            : String(valor)
                      }
                      editable={rol === "ADMINISTRACION"}
                    />
                  );
                })}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
