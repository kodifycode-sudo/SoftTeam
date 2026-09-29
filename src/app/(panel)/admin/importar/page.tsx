import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import {
  DEFINICIONES,
  ORDEN_IMPORTACION,
  type TipoImportacion,
} from "@/server/modules/importacion/definiciones";
import { FormularioImportacion } from "./formulario";

export const metadata: Metadata = { title: "Importar datos" };

export default async function PaginaImportar({ searchParams }: PageProps<"/admin/importar">) {
  await requerirSofteam(["ADMINISTRACION"]);
  const { tipo: pedido } = await searchParams;
  const tipo: TipoImportacion =
    typeof pedido === "string" && pedido in DEFINICIONES ? (pedido as TipoImportacion) : "clientes";
  const definicion = DEFINICIONES[tipo];

  return (
    <>
      <EncabezadoPagina
        titulo="Importar datos"
        descripcion="Para migrar desde el sistema anterior. Primero revisá el archivo: no se guarda nada hasta que no tenga errores."
      />

      <nav aria-label="Qué importar" className="mb-6 flex flex-wrap gap-2">
        {ORDEN_IMPORTACION.map((t, i) => (
          <Link
            key={t}
            href={`/admin/importar?tipo=${t}`}
            aria-current={t === tipo ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: t === tipo ? "default" : "outline", size: "sm" }),
              "gap-2",
            )}
          >
            <span className="tabular-nums opacity-70">{i + 1}.</span> {DEFINICIONES[t].etiqueta}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{definicion.etiqueta}</CardTitle>
            <CardDescription>{definicion.descripcion}</CardDescription>
            <Link
              href={`/admin/importar/plantilla?tipo=${tipo}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 w-fit")}
            >
              <Download data-icon="inline-start" /> Descargar plantilla
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table aria-label="Columnas">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="pl-4">Columna</TableHead>
                    <TableHead>También se reconoce como</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {definicion.columnas.map((c) => (
                    <TableRow key={c.campo}>
                      <TableCell className="pl-4 align-top">
                        <p className="font-medium">{c.titulo}</p>
                        {c.requerida && <Badge variant="secondary">Obligatoria</Badge>}
                      </TableCell>
                      <TableCell className="align-top font-mono text-xs whitespace-normal text-muted-foreground">
                        {c.alias.slice(2).join(", ") || c.campo}
                      </TableCell>
                      <TableCell className="align-top text-xs whitespace-normal text-muted-foreground">
                        {c.ayuda}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <FormularioImportacion
          key={tipo}
          tipo={tipo}
          conAdministradores={tipo === "clientes" || tipo === "usuarios"}
        />
      </div>
    </>
  );
}
