import { Banknote, Check, CreditCard, Link2, Repeat, Sheet, X } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { aTextoDecimal } from "@/domain/dinero";
import { type ModoFacturacion, NOMBRE_MODO } from "@/domain/facturacion/modo";
import { porcentajeTexto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarMediosPago } from "@/server/modules/catalogo/medios-pago";
import { EditarMedioPago } from "./editar";

export const metadata: Metadata = { title: "Medios de pago" };

const TIPOS = {
  TRANSFERENCIA: { etiqueta: "Transferencia", icono: Banknote },
  LINK_MP: { etiqueta: "Link de Mercado Pago", icono: Link2 },
  SUSCRIPCION_MP: { etiqueta: "Suscripción de Mercado Pago", icono: Repeat },
  PLANILLA: { etiqueta: "Planilla (cobro consolidado)", icono: Sheet },
} as const;

function Habilitado({ si, texto }: { si: boolean; texto: string }) {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5",
        si ? "text-foreground" : "text-muted-foreground line-through",
      )}
    >
      {si ? <Check className="size-3.5 text-success" /> : <X className="size-3.5" />} {texto}
    </li>
  );
}

export default async function PaginaMediosPago() {
  const { rol } = await requerirSofteam();
  const db = await obtenerDb();
  const medios = await listarMediosPago(db);

  return (
    <>
      <EncabezadoPagina
        titulo="Medios de pago"
        descripcion="Cada medio puede tener un recargo o una bonificación que se aplica sobre la base neta, antes del IVA."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {medios.map((m) => {
          const tipo = TIPOS[m.tipo];
          const ajuste = m.ajustePorcentaje;
          return (
            <Card key={m.id} className={cn("gap-4", !m.activo && "opacity-60")}>
              <CardHeader className="flex-row items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-brand">
                  <tipo.icono className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="leading-snug">{m.nombre}</CardTitle>
                  <p className="text-xs text-muted-foreground">{tipo.etiqueta}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 tabular-nums",
                    ajuste > 0n && "border-destructive/30 text-destructive",
                    ajuste < 0n && "border-success/30 text-success",
                  )}
                >
                  {ajuste === 0n
                    ? "Sin ajuste"
                    : `${ajuste > 0n ? "+" : ""}${porcentajeTexto(ajuste)}`}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="grid grid-cols-3 gap-1 text-xs">
                  <Habilitado si={m.habilitadoAlta} texto="Alta" />
                  <Habilitado si={m.habilitadoAdicional} texto="Adicional" />
                  <Habilitado si={m.habilitadoRenovacion} texto="Renovación" />
                </ul>
                <p className="text-xs text-muted-foreground">
                  Modos:{" "}
                  {m.modosFacturacion.map((x) => NOMBRE_MODO[x as ModoFacturacion]).join(", ")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {m.generaLink && <Badge variant="secondary">Genera link de pago</Badge>}
                  {m.planilla && <Badge variant="secondary">Factura al grupo</Badge>}
                  {!m.activo && <Badge variant="destructive">Inactivo</Badge>}
                </div>
                {m.instrucciones && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{m.instrucciones}</p>
                )}
              </CardContent>
              {rol === "ADMINISTRACION" && (
                <CardFooter className="justify-end border-t">
                  <EditarMedioPago
                    medio={{
                      id: m.id,
                      nombre: m.nombre,
                      ajuste: aTextoDecimal(m.ajustePorcentaje)
                        .replace(/\.00$/, "")
                        .replace(".", ","),
                      habilitadoAlta: m.habilitadoAlta,
                      habilitadoAdicional: m.habilitadoAdicional,
                      habilitadoRenovacion: m.habilitadoRenovacion,
                      modosFacturacion: m.modosFacturacion,
                      activo: m.activo,
                      instrucciones: m.instrucciones ?? "",
                    }}
                  />
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <CreditCard className="size-3.5" /> Los porcentajes definitivos de cada medio están
        pendientes de Administración (punto abierto 15.1).
      </p>
    </>
  );
}
