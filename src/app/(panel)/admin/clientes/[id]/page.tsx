import {
  ArrowLeft,
  Building2,
  CircleCheck,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ListaActividad } from "@/components/actividad";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { CONDICIONES_IVA_ETIQUETA } from "@/lib/argentina";
import { fechaCorta } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import type { Contacto, Domicilio } from "@/server/db/schema";
import { actividadDeEmpresa, notasDeEmpresa } from "@/server/modules/cuentas/actividad";
import { obtenerCliente } from "@/server/modules/cuentas/consultas";
import {
  facturacionDeOficinas,
  pedidosPendientes,
} from "@/server/modules/cuentas/facturacion-oficinas";
import { abiertosPorEmpresa } from "@/server/modules/soporte/incidentes";
import { EditarEmpresa } from "./editar-empresa";
import { FacturacionOficinas } from "./facturacion-oficinas";
import { NotasEmpresa } from "./notas";

export const metadata: Metadata = { title: "Cliente" };

const UUID = /^[0-9a-f-]{36}$/i;

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm font-medium break-words">{children || "—"}</dd>
    </div>
  );
}

function TarjetaContacto({ titulo, contacto }: { titulo: string; contacto: Contacto | null }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titulo}
      </p>
      {contacto ? (
        <div className="space-y-1.5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <UserRound className="size-4 text-muted-foreground" /> {contacto.nombre}
          </p>
          {contacto.email && (
            <p className="flex items-center gap-2 break-all">
              <Mail className="size-4 shrink-0 text-muted-foreground" /> {contacto.email}
            </p>
          )}
          {contacto.telefono && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" /> {contacto.telefono}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Igual que el administrador</p>
      )}
    </div>
  );
}

const domicilioTexto = (d: Domicilio | null) =>
  d ? `${d.calle}, ${d.ciudad} (${d.codigoPostal}), ${d.provincia}` : "—";

export default async function PaginaCliente({
  params,
  searchParams,
}: PageProps<"/admin/clientes/[id]">) {
  const { rol } = await requerirSofteam();
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const db = await obtenerDb();
  const cliente = await obtenerCliente(db, id);
  if (!cliente) notFound();
  const ids = cliente.empresas.map((e) => e.id);
  const [abiertos, notas, actividad, oficinas, pedidos] = await Promise.all([
    abiertosPorEmpresa(db, ids),
    Promise.all(ids.map((e) => notasDeEmpresa(db, e, true))),
    Promise.all(ids.map((e) => actividadDeEmpresa(db, e, { esSofteam: true, limite: 8 }))),
    facturacionDeOficinas(db, ids),
    pedidosPendientes(db, ids),
  ]);
  const editaFacturacion = rol === "ADMINISTRACION" || rol === "COMERCIAL";
  const edita = editaFacturacion;

  return (
    <>
      <Link
        href="/admin/clientes"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> Clientes
      </Link>
      <EncabezadoPagina
        etiqueta={`Cliente #${cliente.numero}`}
        titulo={cliente.nombre}
        descripcion={`Alta el ${fechaCorta(cliente.creadoEn)}`}
        acciones={
          <>
            {edita && (
              <Link
                href={`/admin/clientes/${cliente.id}/editar`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil data-icon="inline-start" /> Editar datos
              </Link>
            )}
            {cliente.grupo && <Badge variant="outline">Grupo {cliente.grupo.nombreCorto}</Badge>}
            <Badge variant={cliente.activo ? "secondary" : "destructive"}>
              {cliente.activo ? "Activo" : "Inactivo"}
            </Badge>
          </>
        }
      />

      {aviso === "guardado" && (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <CircleCheck />
          <AlertDescription className="text-success">
            Guardamos los datos del cliente.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" /> Facturación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Dato etiqueta="Razón social / titular">{cliente.nombreFactura}</Dato>
              <Dato etiqueta="CUIT">{formatearCuit(cliente.cuit)}</Dato>
              <Dato etiqueta="Condición IVA">{CONDICIONES_IVA_ETIQUETA[cliente.condicionIva]}</Dato>
              <Dato etiqueta="Tipo">
                {cliente.tipoPersona === "JURIDICA"
                  ? `Persona jurídica ${cliente.tipoSociedad ?? ""}`
                  : "Persona humana"}
              </Dato>
              <div className="sm:col-span-2">
                <Dato etiqueta="Domicilio fiscal">
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {domicilioTexto(cliente.domicilioFiscal)}
                  </span>
                </Dato>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="size-4 text-primary" /> Contactos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TarjetaContacto titulo="Administrador" contacto={cliente.contactoAdministrador} />
            <TarjetaContacto titulo="Pagos" contacto={cliente.contactoPagos} />
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 mb-4 flex items-center gap-2 text-lg font-semibold">
        <Building2 className="size-5 text-primary" /> Empresas
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {cliente.empresas.map((e, n) => (
          <Card key={e.id} className="gap-4">
            <CardHeader>
              <CardTitle>{e.nombre}</CardTitle>
              <CardDescription>
                Empresa #{e.numero} · {e.nombreCorto}
              </CardDescription>
              {edita && (
                <CardAction>
                  <EditarEmpresa
                    clienteId={cliente.id}
                    administracion={rol === "ADMINISTRACION"}
                    empresa={{
                      id: e.id,
                      version: e.actualizadoEn.toISOString(),
                      nombre: e.nombre,
                      nombreCorto: e.nombreCorto,
                      tipoCliente: e.tipoCliente,
                      tipoInstalacion: e.tipoInstalacion,
                      activa: e.activa,
                    }}
                  />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={e.tipoCliente === "CORPORATIVO" ? "default" : "secondary"}>
                  {e.tipoCliente === "CORPORATIVO" ? "Corporativo" : "Directo"}
                </Badge>
                <Badge variant="outline">
                  {e.tipoInstalacion === "SAAS" ? "SaaS" : "On-premise"}
                </Badge>
                {!e.activa && <Badge variant="destructive">Inactiva</Badge>}
              </div>
              <dl className="grid grid-cols-3 gap-3">
                <Dato etiqueta="Oficinas">{e.oficinas}</Dato>
                <Dato etiqueta="Usuarios activos">{e.colaboradores}</Dato>
                <Dato etiqueta="Soporte abierto">
                  {abiertos.get(e.id) ? (
                    <Link
                      href={`/admin/soporte?q=${encodeURIComponent(e.nombre)}`}
                      className="text-primary hover:underline"
                    >
                      {abiertos.get(e.id)} pedido{abiertos.get(e.id) === 1 ? "" : "s"}
                    </Link>
                  ) : (
                    "Ninguno"
                  )}
                </Dato>
              </dl>
              <FacturacionOficinas
                clienteId={cliente.id}
                editable={editaFacturacion}
                oficinas={oficinas
                  .filter((o) => o.empresaId === e.id)
                  .map((o) => ({
                    id: o.id,
                    codigo: `${o.canalCodigo}-${o.codigo}`,
                    nombre: o.nombre,
                    activa: o.activa,
                    cliente: o.cliente,
                    pedido: pedidos.find((p) => p.oficinaId === o.id) ?? null,
                  }))}
              />
              <NotasEmpresa empresaId={e.id} clienteId={cliente.id} notas={notas[n] ?? ""} />
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Actividad reciente</p>
                <ListaActividad actividad={actividad[n] ?? []} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
