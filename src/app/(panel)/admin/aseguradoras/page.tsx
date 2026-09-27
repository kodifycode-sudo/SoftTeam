import { Cable, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { obtenerDb } from "@/server/db";
import {
  type AseguradoraCatalogo,
  listarCatalogoAseguradoras,
} from "@/server/modules/catalogo/aseguradoras";
import { EditarAseguradora, NuevaAseguradora } from "./dialogo";

export const metadata: Metadata = { title: "Aseguradoras" };

/** Interfaces disponibles, con cuántas empresas usan cada una. */
function Interfaces({ a }: { a: AseguradoraCatalogo }) {
  const lista = [
    { nombre: "Prodigal", disponible: a.interfazProdigalDisponible, enUso: a.conProdigal },
    { nombre: "CotiWeb", disponible: a.interfazCotiwebDisponible, enUso: a.conCotiweb },
    { nombre: "Documentos", disponible: a.interfazDocumentosDisponible, enUso: 0 },
  ].filter((i) => i.disponible || i.enUso > 0);
  if (lista.length === 0) return <span className="text-xs text-muted-foreground">Ninguna</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {lista.map((i) => (
        <Badge
          key={i.nombre}
          variant="outline"
          className={cn("gap-1", !i.disponible && "border-warning/60 bg-warning/10")}
          title={
            !i.disponible
              ? "Ya no está disponible, pero hay empresas que la siguen usando"
              : undefined
          }
        >
          <Cable className="size-3" /> {i.nombre}
          {i.enUso > 0 && <span className="tabular-nums text-muted-foreground">· {i.enUso}</span>}
          {!i.disponible && " (retirada)"}
        </Badge>
      ))}
    </div>
  );
}

export default async function CatalogoAseguradoras() {
  const { rol } = await requerirSofteam();
  const aseguradoras = await listarCatalogoAseguradoras(await obtenerDb());
  const edita = rol === "ADMINISTRACION";

  return (
    <>
      <EncabezadoPagina
        titulo="Aseguradoras"
        descripcion="Catálogo de compañías de Argentina y qué interfaces están disponibles. Las empresas eligen con cuáles trabajan desde su portal."
        acciones={edita && <NuevaAseguradora />}
      />
      {aseguradoras.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay aseguradoras</EmptyTitle>
            <EmptyDescription>
              Agregá las compañías con las que trabajan tus clientes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Celular: tarjetas */}
          <ul className="grid gap-3 md:hidden">
            {aseguradoras.map((a) => (
              <li key={a.id}>
                <Card className={cn("gap-3 p-4", !a.activa && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{a.nombre}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {a.abreviatura}
                        {a.codigoLegal && ` · SSN ${a.codigoLegal}`}
                      </p>
                    </div>
                    {!a.activa && <Badge variant="outline">Discontinuada</Badge>}
                  </div>
                  <Interfaces a={a} />
                  <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                    <span>
                      {a.empresas} empresa{a.empresas === 1 ? "" : "s"}
                    </span>
                    {edita && <EditarAseguradora aseguradora={a} />}
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Aseguradora</TableHead>
                  <TableHead>Interfaces disponibles</TableHead>
                  <TableHead className="text-center">Empresas</TableHead>
                  {edita && <TableHead className="w-28" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {aseguradoras.map((a) => (
                  <TableRow key={a.id} className={cn(!a.activa && "opacity-60")}>
                    <TableCell className="pl-4">
                      <p className="flex items-center gap-2 font-medium">
                        {a.nombre}
                        {!a.activa && <Badge variant="outline">Discontinuada</Badge>}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {a.abreviatura}
                        {a.codigoLegal && ` · SSN ${a.codigoLegal}`}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Interfaces a={a} />
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{a.empresas}</TableCell>
                    {edita && (
                      <TableCell>
                        <EditarAseguradora aseguradora={a} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
