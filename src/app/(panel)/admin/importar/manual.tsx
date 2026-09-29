import { BookOpen, Database, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFINICIONES,
  ORDEN_IMPORTACION,
  type TipoImportacion,
} from "@/server/modules/importacion/definiciones";
import { Codigo } from "./copiar";

/** Comando de PowerShell que exporta una consulta de SQL Server con el formato de STLic. */
function comandoExportacion(consulta: string, archivo: string) {
  const enUnaLinea = consulta.replace(/\s+/g, " ").trim();
  return `Invoke-Sqlcmd -ServerInstance "SERVIDOR" -Database "BASE" -Query "${enUnaLinea}" |
  Select-Object * -ExcludeProperty ItemArray, Table, RowError, RowState, HasErrors |
  Export-Csv "${archivo}" -Delimiter ";" -NoTypeInformation -Encoding UTF8`;
}

const EJEMPLO = `STLicEmpresaCod;StLicUsuarioNom;StLicUsuarioMail;UsuarioAccesoProdigalSino
2001;Pérez, Ana;ana@broker.com.ar;S
2001;"Gómez; Juan";juan@broker.com.ar;N`;

/** Reglas del formato: son las mismas para todos los tipos. */
export function ManualFormato() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-4" /> Cómo preparar el archivo
        </CardTitle>
        <CardDescription>
          El formato es fijo y lo definimos nosotros: si el archivo no lo respeta, se rechaza entero
          y no se guarda nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Primera línea: los nombres de los campos</strong>, con el nombre del atributo de
            la KB (<code className="font-mono text-xs">STLicClienteFacCUIT</code>) o el nombre de
            STLic (<code className="font-mono text-xs">CUIT</code>). No importan mayúsculas, acentos
            ni espacios. Las columnas que no se reconocen se ignoran y se avisan.
          </li>
          <li>
            <strong>Desde la segunda línea: una fila por registro</strong>, con los valores en el
            mismo orden que los nombres.
          </li>
          <li>
            <strong>Todo separado por punto y coma (;).</strong> Un valor que tenga punto y coma o
            un salto de línea va entre comillas dobles; una comilla dentro de un valor se escribe
            doble ("").
          </li>
          <li>
            Texto en <strong>UTF-8</strong> (también se acepta el ANSI de Windows). Sí o no: S/N,
            Sí/No, 1/0 o True/False. Hasta 4 MB y 10.000 filas por archivo: si es más grande,
            dividilo.
          </li>
        </ol>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Ejemplo (usuarios):</p>
          <Codigo texto={EJEMPLO} etiqueta="el ejemplo" />
        </div>
        <div className="space-y-1.5">
          <p className="font-medium">Orden de importación</p>
          <p className="text-muted-foreground">
            Cada archivo usa lo que cargaron los anteriores (las empresas, los productores, el
            catálogo de aseguradoras):
          </p>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
            {ORDEN_IMPORTACION.map((t) => (
              <li key={t}>
                {DEFINICIONES[t].etiqueta}{" "}
                <span className="font-mono text-xs">
                  ({DEFINICIONES[t].origen.tablas.join(", ")})
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-1.5">
          <p className="font-medium">Siempre, antes de importar</p>
          <p className="text-muted-foreground">
            Subí el archivo y tocá <strong>Revisar</strong>: muestra qué se crearía y los errores
            con su número de línea, sin guardar nada. Recién cuando no hay errores, importalo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Cómo sacar este archivo del sistema anterior (base de la KB GeneXus). */
export function ManualExportacion({ tipo }: { tipo: TipoImportacion }) {
  const { origen, etiqueta } = DEFINICIONES[tipo];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4" /> Cómo exportarlo del sistema anterior
        </CardTitle>
        <CardDescription>
          {etiqueta}: {origen.tablas.length > 1 ? "tablas" : "tabla"}{" "}
          <span className="font-mono">{origen.tablas.join(", ")}</span> de la base de la KB. Las
          columnas de la base ya tienen los nombres de los atributos, así que el archivo sale con la
          primera línea correcta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="space-y-1.5">
          <p className="font-medium">1. La consulta</p>
          <Codigo texto={origen.consulta} etiqueta="la consulta" />
          {origen.nota && <p className="text-xs text-muted-foreground">{origen.nota}</p>}
        </div>
        <div className="space-y-1.5">
          <p className="font-medium">2a. Exportarla con PowerShell (recomendado)</p>
          <p className="text-muted-foreground">
            En la PC con acceso a la base (módulo <span className="font-mono">SqlServer</span>),
            reemplazando <span className="font-mono">SERVIDOR</span> y{" "}
            <span className="font-mono">BASE</span>. Genera{" "}
            <span className="font-mono">{origen.archivo}</span> separado por punto y coma y en
            UTF-8:
          </p>
          <Codigo
            texto={comandoExportacion(origen.consulta, origen.archivo)}
            etiqueta="el comando"
          />
        </div>
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 font-medium">
            <FileSpreadsheet className="size-4" /> 2b. O con Excel
          </p>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
            <li>Ejecutá la consulta en SQL Server Management Studio.</li>
            <li>
              Sobre los resultados: clic derecho → <strong>Copiar con encabezados</strong>, y pegalo
              en una hoja nueva de Excel.
            </li>
            <li>
              <strong>Guardar como → CSV (delimitado por comas)</strong>. Con la configuración
              regional de Argentina, Excel separa con punto y coma. Abrí el archivo con el Bloc de
              notas para confirmarlo.
            </li>
          </ol>
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs">
            Cuidado: Excel convierte los números largos (un CUIT pasa a 3,07E+10) y quita los ceros
            a la izquierda (la oficina 001 pasa a 1). Antes de pegar, poné todas las columnas en
            formato Texto. Por eso recomendamos PowerShell.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
