import { MailQuestion, TriangleAlert, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { excedeLicencia, PRODUCTOS_CON_ACCESO } from "@/domain/cuentas/limites";
import { cn } from "@/lib/utils";
import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  type Colaborador,
  listarColaboradores,
} from "@/server/modules/configuracion/colaboradores";
import { NOMBRE_PRODUCTO, usoDeLimites } from "@/server/modules/configuracion/limites";
import { listarCanales, listarOficinas } from "@/server/modules/cuentas/oficinas";
import {
  BotonEditarColaborador,
  BotonNuevoColaborador,
  CambiarEstadoColaborador,
  type DatosColaborador,
  type OpcionAlcance,
  ReenviarAcceso,
  type UsoAcceso,
} from "./dialogos";

export const metadata: Metadata = { title: "Usuarios" };

const alcanceDe = (c: Colaborador) =>
  c.oficinaId ? `oficina:${c.oficinaId}` : c.canalId ? `canal:${c.canalId}` : "empresa";

const alcanceLegible = (c: Colaborador) =>
  c.oficinaCodigo
    ? `Oficina ${c.oficinaCodigo} · ${c.oficinaNombre}`
    : c.canalCodigo
      ? `Canal ${c.canalCodigo} · ${c.canalNombre}`
      : "Toda la empresa";

const datos = (c: Colaborador): DatosColaborador => ({
  id: c.id,
  nombre: c.nombre,
  iniciales: c.iniciales,
  email: c.email,
  telefono: c.telefono,
  alcance: alcanceDe(c),
  usuarioProdigal: c.usuarioProdigal,
  adminGeneral: c.adminGeneral,
  adminComercial: c.adminComercial,
  adminOperativo: c.adminOperativo,
  accesoProdigal: c.accesoProdigal,
  accesoCotiweb: c.accesoCotiweb,
  accesoBienseguro: c.accesoBienseguro,
  accesoBoletin: c.accesoBoletin,
});

const administra = (c: Colaborador) => c.adminGeneral || c.adminComercial || c.adminOperativo;

function Permisos({ c }: { c: Colaborador }) {
  return (
    <div className="flex flex-wrap gap-1">
      {c.adminGeneral && <Badge>Admin general</Badge>}
      {c.adminComercial && <Badge variant="secondary">Paquetes y pagos</Badge>}
      {c.adminOperativo && <Badge variant="secondary">Configuración</Badge>}
      {administra(c) && c.activo && c.usuarioVerificado === false && (
        <Badge variant="outline" className="gap-1 border-warning/60 bg-warning/10">
          <MailQuestion className="size-3" /> Acceso pendiente
        </Badge>
      )}
    </div>
  );
}

function Accesos({ c }: { c: Colaborador }) {
  const activos = PRODUCTOS_CON_ACCESO.filter(
    (p) =>
      ({
        prodigal: c.accesoProdigal,
        cotiweb: c.accesoCotiweb,
        bienseguro: c.accesoBienseguro,
        boletin: c.accesoBoletin,
      })[p],
  );
  if (activos.length === 0) return <span className="text-xs text-muted-foreground">Ninguno</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {activos.map((p) => (
        <Badge key={p} variant="outline">
          {NOMBRE_PRODUCTO[p]}
        </Badge>
      ))}
    </div>
  );
}

export default async function PaginaUsuarios() {
  const contexto = await requerirConfiguracion();
  const db = await obtenerDb();
  const [colaboradores, uso, canales, oficinas] = await Promise.all([
    listarColaboradores(db, contexto.empresaId),
    usoDeLimites(db, contexto.empresaId),
    listarCanales(db, contexto.empresaId),
    listarOficinas(db, contexto.empresaId),
  ]);

  const alcances: OpcionAlcance[] = [
    { valor: "empresa", etiqueta: "Toda la empresa" },
    ...canales.flatMap((c) => [
      { valor: `canal:${c.id}`, etiqueta: `Canal ${c.codigo} · ${c.nombre}` },
      ...oficinas
        .filter((o) => o.canalId === c.id)
        .map((o) => ({
          valor: `oficina:${o.id}`,
          etiqueta: `   Oficina ${c.codigo}-${o.codigo} · ${o.nombre}`,
        })),
    ]),
  ];
  const usoAccesos: UsoAcceso[] = PRODUCTOS_CON_ACCESO.map((p) => ({
    ...uso.usuarios[p],
    nombre: NOMBRE_PRODUCTO[p],
  }));
  const excedidos = usoAccesos.filter(excedeLicencia);
  const comunes = { alcances, uso: usoAccesos, puedeDarPermisos: contexto.adminGeneral };

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Quiénes usan los productos de la empresa y quiénes administran la cuenta."
        acciones={<BotonNuevoColaborador {...comunes} />}
      />

      {excedidos.length > 0 && (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlert />
          <AlertTitle>Tenés más usuarios activos que los licenciados</AlertTitle>
          <AlertDescription>
            {excedidos
              .map((u) => `${u.nombre}: ${u.enUso} activos de ${u.licenciados}`)
              .join(" · ")}
            . Dá de baja los que sobran o sumá usuarios con un paquete.
          </AlertDescription>
        </Alert>
      )}

      <section
        aria-label="Usuarios licenciados"
        className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        {usoAccesos.map((u) => {
          const porcentaje =
            u.licenciados && u.licenciados > 0
              ? Math.min(100, Math.round((u.enUso / u.licenciados) * 100))
              : 0;
          const excedido = excedeLicencia(u);
          return (
            <Card key={u.producto} className="gap-2 p-3 sm:p-4">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                <p className="text-sm font-medium">{u.nombre}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {!u.licenciado ? (
                    "Sin licencia"
                  ) : u.licenciados === null ? (
                    `${u.enUso} con acceso`
                  ) : (
                    <>
                      <span
                        className={cn(
                          "font-semibold text-foreground",
                          excedido && "text-destructive",
                        )}
                      >
                        {u.enUso}
                      </span>{" "}
                      de {u.licenciados}
                    </>
                  )}
                </p>
              </div>
              {u.licenciado && u.licenciados !== null && (
                // biome-ignore lint/a11y/useSemanticElements: <meter> no se puede estilizar igual en todos los navegadores; el role conserva la semántica.
                <div
                  role="meter"
                  aria-label={`Usuarios de ${u.nombre}`}
                  aria-valuenow={u.enUso}
                  aria-valuemin={0}
                  aria-valuemax={u.licenciados}
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      "h-full rounded-full bg-primary transition-all",
                      porcentaje >= 100 && "bg-brand",
                      excedido && "bg-destructive",
                    )}
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </section>

      {colaboradores.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay usuarios</EmptyTitle>
            <EmptyDescription>Cargá a las personas que usan los productos.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Celular: tarjetas */}
          <ul className="grid gap-3 md:hidden">
            {colaboradores.map((c) => (
              <li key={c.id}>
                <Card className={cn("gap-3 p-4", !c.activo && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{c.nombre}</p>
                      <p className="text-xs break-all text-muted-foreground">{c.email}</p>
                    </div>
                    {!c.activo && <Badge variant="outline">De baja</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{alcanceLegible(c)}</p>
                  <Accesos c={c} />
                  <Permisos c={c} />
                  <div className="flex flex-wrap justify-end gap-1 border-t pt-2">
                    <FilaAcciones
                      c={c}
                      comunes={comunes}
                      propio={c.id === contexto.colaboradorId}
                    />
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
                  <TableHead className="pl-4">Persona</TableHead>
                  <TableHead className="hidden lg:table-cell">Ve</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Administra</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {colaboradores.map((c) => (
                  <TableRow key={c.id} className={cn(!c.activo && "opacity-60")}>
                    <TableCell className="pl-4">
                      <p className="flex items-center gap-2 font-medium">
                        {c.nombre}
                        {!c.activo && <Badge variant="outline">De baja</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.email}
                        {c.usuarioProdigal && ` · Prodigal: ${c.usuarioProdigal}`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {alcanceLegible(c)}
                    </TableCell>
                    <TableCell>
                      <Accesos c={c} />
                    </TableCell>
                    <TableCell>
                      <Permisos c={c} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <FilaAcciones
                          c={c}
                          comunes={comunes}
                          propio={c.id === contexto.colaboradorId}
                        />
                      </div>
                    </TableCell>
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

function FilaAcciones({
  c,
  comunes,
  propio,
}: {
  c: Colaborador;
  comunes: { alcances: OpcionAlcance[]; uso: UsoAcceso[]; puedeDarPermisos: boolean };
  propio: boolean;
}) {
  return (
    <>
      {c.activo && administra(c) && c.usuarioVerificado === false && <ReenviarAcceso id={c.id} />}
      {c.activo && <BotonEditarColaborador colaborador={datos(c)} {...comunes} />}
      {!propio && <CambiarEstadoColaborador id={c.id} nombre={c.nombre} activo={c.activo} />}
    </>
  );
}
