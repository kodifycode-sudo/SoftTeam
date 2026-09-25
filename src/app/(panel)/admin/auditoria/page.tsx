import { ChevronDown, History, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { SelectNativo } from "@/components/select-nativo";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { entidadesAuditadas, listarAuditoria } from "@/server/modules/auditoria";

export const metadata: Metadata = { title: "Auditoría" };

const ENTIDADES: Record<string, string> = {
  colaborador: "Usuario de empresa",
  empresa_aseguradora: "Aseguradora de empresa",
  productor: "Productor",
  politicas: "Políticas",
  oficina: "Oficina",
  orden: "Orden",
  paquete: "Paquete",
  medio_pago: "Medio de pago",
  usuario_softeam: "Usuario SOFTeam",
  sistema_api: "Sistema integrado",
  cliente: "Cliente",
};

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

const ACCIONES: Record<string, string> = {
  alta: "Alta",
  alta_en_linea: "Alta en línea",
  baja: "Baja",
  modificacion: "Modificación",
  reactivacion: "Reactivación",
  activar: "Activación",
  inactivar: "Inactivación",
  cambio_rol: "Cambio de rol",
  codigo_alta: "Alta de código",
  codigo_baja: "Baja de código",
  confirmar: "Confirmación",
  cancelar: "Cancelación",
  registrar_pago: "Pago registrado",
  rotar_secreto: "Secreto rotado",
  interfaz_prodigal_alta: "Alta de interfaz Prodigal",
  interfaz_prodigal_baja: "Baja de interfaz Prodigal",
  interfaz_cotiweb_alta: "Alta de interfaz CotiWeb",
  interfaz_cotiweb_baja: "Baja de interfaz CotiWeb",
};

const accionLegible = (accion: string) => ACCIONES[accion] ?? accion.replaceAll("_", " ");

/** Nombre del registro, si el cambio lo trae (más fácil de reconocer que el id). */
function nombreDe(antes: unknown, despues: unknown): string | undefined {
  for (const valor of [despues, antes]) {
    if (valor && typeof valor === "object") {
      const { nombre, email } = valor as { nombre?: unknown; email?: unknown };
      if (typeof nombre === "string") return nombre;
      if (typeof email === "string") return email;
    }
  }
  return undefined;
}

function Json({ titulo, valor }: { titulo: string; valor: unknown }) {
  if (valor === null || valor === undefined) return null;
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <pre className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed">
        {JSON.stringify(valor, null, 2)}
      </pre>
    </div>
  );
}

export default async function PaginaAuditoria({ searchParams }: PageProps<"/admin/auditoria">) {
  await requerirSofteam(["ADMINISTRACION", "SOPORTE"]);
  const { entidad, q, antes } = await searchParams;
  const filtros = {
    entidad: typeof entidad === "string" && entidad ? entidad : undefined,
    texto: typeof q === "string" && q ? q : undefined,
    antesDe: typeof antes === "string" && /^\d+$/.test(antes) ? Number(antes) : undefined,
  };
  const db = await obtenerDb();
  const [{ registros, siguiente }, entidades] = await Promise.all([
    listarAuditoria(db, filtros),
    entidadesAuditadas(db),
  ]);

  const masAntiguos = new URLSearchParams();
  if (filtros.entidad) masAntiguos.set("entidad", filtros.entidad);
  if (filtros.texto) masAntiguos.set("q", filtros.texto);
  if (siguiente) masAntiguos.set("antes", String(siguiente));

  return (
    <>
      <EncabezadoPagina
        titulo="Auditoría"
        descripcion="Quién cambió qué y cuándo: precios, estados, roles, usuarios y configuración de las empresas."
      />

      <search className="mb-5">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              key={filtros.texto}
              defaultValue={filtros.texto}
              placeholder="Buscar por persona, mail, acción o dato"
              className="h-10 pl-9"
              aria-label="Buscar en la auditoría"
            />
          </div>
          <SelectNativo
            name="entidad"
            key={filtros.entidad}
            defaultValue={filtros.entidad ?? ""}
            aria-label="Tipo de registro"
            className="h-10 sm:w-56"
          >
            <option value="">Todos los registros</option>
            {entidades.map((e) => (
              <option key={e} value={e}>
                {ENTIDADES[e] ?? e}
              </option>
            ))}
          </SelectNativo>
          <Button type="submit" variant="secondary" className="h-10">
            Filtrar
          </Button>
        </form>
      </search>

      {registros.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>Sin registros</EmptyTitle>
            <EmptyDescription>
              {filtros.texto || filtros.entidad
                ? "No hay registros con esos filtros."
                : "Los cambios aparecen acá a medida que se hacen."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="gap-0 divide-y overflow-hidden p-0">
          {registros.map((r) => (
            <details key={r.id} className="group">
              <summary className="flex cursor-pointer list-none flex-col gap-1.5 px-4 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
                <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {fechaHora(r.en)}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Badge variant="outline">{ENTIDADES[r.entidad] ?? r.entidad}</Badge>
                  <span className="font-medium">{accionLegible(r.accion)}</span>
                  {nombreDe(r.antes, r.despues) && (
                    <span className="truncate text-sm">{nombreDe(r.antes, r.despues)}</span>
                  )}
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {r.entidadId}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm sm:w-56 sm:justify-end">
                  <span className="truncate">
                    {r.actorNombre ??
                      (r.actorTipo === "usuario" ? "Usuario eliminado" : r.actorTipo)}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="space-y-3 bg-muted/20 px-4 py-4">
                {r.actorEmail && (
                  <p className="text-xs text-muted-foreground">
                    Por {r.actorNombre} ({r.actorEmail})
                  </p>
                )}
                {r.motivo && (
                  <p className="text-sm">
                    <span className="font-medium">Motivo:</span> {r.motivo}
                  </p>
                )}
                <div className="flex flex-col gap-3 lg:flex-row">
                  <Json titulo="Antes" valor={r.antes} />
                  <Json titulo="Después" valor={r.despues} />
                </div>
                {r.antes === null && r.despues === null && !r.motivo && (
                  <p className="text-xs text-muted-foreground">Sin más detalle.</p>
                )}
              </div>
            </details>
          ))}
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {registros.length} registro{registros.length === 1 ? "" : "s"}
          {filtros.antesDe ? " (página anterior)" : ""}
        </span>
        <span className="flex gap-2">
          {filtros.antesDe && (
            <Link
              href={`/admin/auditoria?${new URLSearchParams({
                ...(filtros.entidad ? { entidad: filtros.entidad } : {}),
                ...(filtros.texto ? { q: filtros.texto } : {}),
              })}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Más recientes
            </Link>
          )}
          {siguiente && (
            <Link
              href={`/admin/auditoria?${masAntiguos}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Más antiguos
            </Link>
          )}
        </span>
      </div>
    </>
  );
}
