import { MapPin } from "lucide-react";
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
import { fechaCorta, porcentajeTexto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarMonedas, listarPaises, listarProvincias } from "@/server/modules/catalogo/paises";
import { DialogoMoneda, DialogoPais, DialogoProvincia } from "./dialogos";

export const metadata: Metadata = { title: "Países y monedas" };

/** "1234.500000" → "1.234,5" */
const cotizacionTexto = (valor: string | null) =>
  valor === null ? "" : Number(valor).toLocaleString("es-AR", { maximumFractionDigits: 6 });

/** Para editar: sin separador de miles. */
const cotizacionCampo = (valor: string | null) =>
  valor === null ? "" : String(Number(valor)).replace(".", ",");

function Encabezado({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion: string;
  accion?: React.ReactNode;
}) {
  return (
    <CardHeader className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </div>
      {accion}
    </CardHeader>
  );
}

export default async function PaginaPaises({ searchParams }: PageProps<"/admin/paises">) {
  const { rol } = await requerirSofteam();
  const edita = rol === "ADMINISTRACION";
  const db = await obtenerDb();
  const [monedas, paises] = await Promise.all([listarMonedas(db), listarPaises(db)]);
  const { pais: elegido } = await searchParams;
  const pais =
    paises.find((p) => p.id === elegido) ?? paises.find((p) => p.id === "AR") ?? paises[0];
  const provincias = pais ? await listarProvincias(db, pais.id) : [];
  const monedasActivas = monedas.filter((m) => m.activa).map((m) => m.codigo);

  return (
    <>
      <EncabezadoPagina
        titulo="Países y monedas"
        descripcion="Dónde se vende: cada país con su moneda, su IVA y sus provincias. Los cambios quedan en la auditoría."
      />
      <div className="grid gap-6">
        <Card className="overflow-hidden pb-0">
          <Encabezado
            titulo="Monedas"
            descripcion="Cotización en pesos argentinos por unidad."
            accion={edita && <DialogoMoneda />}
          />
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Moneda</TableHead>
                  <TableHead>Símbolo</TableHead>
                  <TableHead className="text-right">Cotización</TableHead>
                  <TableHead>Actualizada</TableHead>
                  <TableHead className="text-center">Países</TableHead>
                  {edita && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {monedas.map((m) => (
                  <TableRow key={m.codigo} className={cn(!m.activa && "opacity-60")}>
                    <TableCell className="pl-4">
                      <span className="font-mono">{m.codigo}</span> · {m.nombre}
                      {!m.activa && (
                        <Badge variant="outline" className="ml-2">
                          Inactiva
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{m.simbolo}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cotizacionTexto(m.cotizacion) || (
                        <span className="text-muted-foreground">Sin cargar</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.cotizacionEn ? fechaCorta(m.cotizacionEn) : "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{m.paises}</TableCell>
                    {edita && (
                      <TableCell>
                        <DialogoMoneda
                          moneda={{
                            codigo: m.codigo,
                            nombre: m.nombre,
                            simbolo: m.simbolo,
                            cotizacion: cotizacionCampo(m.cotizacion),
                            activa: m.activa,
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="overflow-hidden pb-0">
          <Encabezado
            titulo="Países"
            descripcion="Cada país tiene su catálogo de paquetes y de aseguradoras."
            accion={edita && <DialogoPais monedas={monedasActivas} />}
          />
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">País</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">IVA general</TableHead>
                  <TableHead className="text-center">Provincias</TableHead>
                  <TableHead className="text-center">Empresas</TableHead>
                  {edita && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paises.map((p) => (
                  <TableRow
                    key={p.id}
                    aria-current={p.id === pais?.id ? "true" : undefined}
                    className={cn(
                      !p.activo && "opacity-60",
                      p.id === pais?.id && "bg-primary/5 hover:bg-primary/10",
                    )}
                  >
                    <TableCell className="pl-4">
                      <span className="font-mono">{p.id}</span> · {p.nombre}
                      <span className="text-muted-foreground"> · +{p.prefijoTelefonico}</span>
                      {!p.activo && (
                        <Badge variant="outline" className="ml-2">
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{p.moneda}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {porcentajeTexto(p.alicuotaIvaGeneral)}
                    </TableCell>
                    <TableCell className="text-center">
                      {/* Lleva a la tarjeta de provincias de este país, más abajo. */}
                      <Link
                        href={`/admin/paises?pais=${p.id}#provincias`}
                        aria-label={`Provincias de ${p.nombre}: ${p.provincias}`}
                        aria-current={p.id === pais?.id ? "page" : undefined}
                        className={buttonVariants({
                          variant: p.id === pais?.id ? "secondary" : "outline",
                          size: "sm",
                          className: "tabular-nums",
                        })}
                      >
                        <MapPin data-icon="inline-start" />
                        {p.provincias === 0 ? "Cargar" : p.provincias}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{p.empresas}</TableCell>
                    {edita && (
                      <TableCell>
                        <DialogoPais
                          monedas={
                            monedasActivas.includes(p.moneda)
                              ? monedasActivas
                              : [p.moneda, ...monedasActivas]
                          }
                          pais={{
                            id: p.id,
                            nombre: p.nombre,
                            nombreCorto: p.nombreCorto ?? "",
                            prefijoTelefonico: p.prefijoTelefonico,
                            moneda: p.moneda,
                            alicuotaIvaGeneral: (Number(p.alicuotaIvaGeneral) / 100)
                              .toString()
                              .replace(".", ","),
                            activo: p.activo,
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {pais && (
          <Card id="provincias" className="scroll-mt-20 overflow-hidden pb-0">
            <Encabezado
              titulo={`Provincias de ${pais.nombre}`}
              descripcion="Las que se ofrecen en los domicilios y se aceptan al importar. Cada provincia es de un solo país."
              accion={edita && <DialogoProvincia paisId={pais.id} paisNombre={pais.nombre} />}
            />
            {paises.length > 1 && (
              <nav aria-label="Elegir país" className="flex flex-wrap gap-2 px-4 pb-4">
                {paises.map((p) => (
                  <Link
                    key={p.id}
                    href={`/admin/paises?pais=${p.id}#provincias`}
                    scroll={false}
                    aria-current={p.id === pais.id ? "page" : undefined}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      p.id === pais.id
                        ? "border-primary bg-primary/10 font-medium text-primary"
                        : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.nombre} <span className="tabular-nums opacity-70">({p.provincias})</span>
                  </Link>
                ))}
              </nav>
            )}
            <CardContent className="overflow-x-auto p-0">
              {provincias.length === 0 ? (
                <p className="px-4 pb-6 text-sm text-muted-foreground">
                  Todavía no hay provincias de {pais.nombre}.
                  {edita && " Cargá la primera con «Nueva provincia»: el código se genera solo."}
                </p>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-24 pl-4">Código</TableHead>
                      <TableHead>Provincia</TableHead>
                      {edita && <TableHead className="w-24" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {provincias.map((p) => (
                      <TableRow key={p.id} className={cn(!p.activa && "opacity-60")}>
                        <TableCell className="pl-4 font-mono">{p.codigo}</TableCell>
                        <TableCell>
                          {p.nombre}
                          {!p.activa && (
                            <Badge variant="outline" className="ml-2">
                              Inactiva
                            </Badge>
                          )}
                        </TableCell>
                        {edita && (
                          <TableCell>
                            <DialogoProvincia
                              paisId={pais.id}
                              paisNombre={pais.nombre}
                              provincia={{
                                id: p.id,
                                codigo: p.codigo,
                                nombre: p.nombre,
                                activa: p.activa,
                              }}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
