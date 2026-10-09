import { Landmark } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarCondicionesIva } from "@/server/modules/catalogo/condiciones-iva";
import { listarEmisores } from "@/server/modules/catalogo/emisores";
import { listarPaises } from "@/server/modules/catalogo/paises";
import { DialogoEmisor } from "./dialogo";

export const metadata: Metadata = { title: "Emisores" };

export default async function PaginaEmisores() {
  await requerirSofteam(["ADMINISTRACION"]);
  const db = await obtenerDb();
  const [emisores, paises, condiciones] = await Promise.all([
    listarEmisores(db),
    listarPaises(db),
    listarCondicionesIva(db, "AR"),
  ]);
  const opciones = {
    paises: paises.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre })),
    // El emisor emite A y B: solo condiciones con comprobante A.
    condiciones: condiciones
      .filter((c) => c.activa && c.comprobante === "A")
      .map((c) => ({ codigo: c.codigo, nombre: c.nombre })),
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Emisores"
        descripcion="Sociedades de SOFTeam que facturan. Cada cliente tiene un emisor; sus órdenes se facturan y cobran con la cuenta de Xubio y de Mercado Pago de ese emisor."
        acciones={<DialogoEmisor opciones={opciones} />}
      />
      {emisores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay emisores: sin uno no se puede vender. Cargá el primero y marcalo como
          preferido.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {emisores.map((e) => (
            <Card key={e.id} className={cn("gap-4", !e.activo && "opacity-60")}>
              <CardHeader className="flex-row items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-brand">
                  <Landmark className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="leading-snug">{e.razonSocial}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    CUIT {formatearCuit(e.cuit)}
                    {e.puntoVenta ? ` · Punto de venta ${e.puntoVenta}` : ""}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {e.preferido && <Badge>Preferido</Badge>}
                <Badge variant={e.xubio ? "secondary" : "outline"}>
                  {e.xubio ? "Xubio" : "Factura a mano"}
                </Badge>
                <Badge variant={e.mercadoPago ? "secondary" : "outline"}>
                  {e.mercadoPago ? "Mercado Pago" : "Sin Mercado Pago"}
                </Badge>
                {!e.activo && <Badge variant="destructive">Inactivo</Badge>}
              </CardContent>
              <CardFooter className="justify-end border-t">
                <DialogoEmisor emisor={e} opciones={opciones} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
