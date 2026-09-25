import {
  ArrowLeft,
  Building2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { CONDICIONES_IVA_ETIQUETA } from "@/lib/argentina";
import { fechaCorta } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import type { Contacto, Domicilio } from "@/server/db/schema";
import { obtenerCliente } from "@/server/modules/cuentas/consultas";

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

export default async function PaginaCliente({ params }: PageProps<"/admin/clientes/[id]">) {
  await requerirSofteam();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = await obtenerDb();
  const cliente = await obtenerCliente(db, id);
  if (!cliente) notFound();

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
            {cliente.grupo && <Badge variant="outline">Grupo {cliente.grupo.nombreCorto}</Badge>}
            <Badge variant={cliente.activo ? "secondary" : "destructive"}>
              {cliente.activo ? "Activo" : "Inactivo"}
            </Badge>
          </>
        }
      />

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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cliente.empresas.map((e) => (
          <Card key={e.id} className="gap-4">
            <CardHeader>
              <CardTitle>{e.nombre}</CardTitle>
              <CardDescription>
                Empresa #{e.numero} · {e.nombreCorto}
              </CardDescription>
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
              <dl className="grid grid-cols-2 gap-3">
                <Dato etiqueta="Oficinas">{e.oficinas}</Dato>
                <Dato etiqueta="Usuarios activos">{e.colaboradores}</Dato>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
