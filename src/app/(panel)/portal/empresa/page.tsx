import {
  Building2,
  History,
  Mail,
  MapPin,
  Phone,
  Receipt,
  ServerCog,
  Settings2,
  StickyNote,
  UserRoundCog,
} from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ListaActividad } from "@/components/actividad";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { CONDICIONES_IVA_ETIQUETA } from "@/lib/argentina";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { actividadDeEmpresa, notasDeEmpresa } from "@/server/modules/cuentas/actividad";
import { obtenerCliente } from "@/server/modules/cuentas/consultas";
import { obtenerEmpresaDelPortal } from "@/server/modules/cuentas/empresa";

export const metadata: Metadata = { title: "Mi empresa" };

function Dato({
  etiqueta,
  children,
  icono,
}: {
  etiqueta: string;
  children: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="flex items-start gap-1.5 text-sm font-medium break-words">
        {icono}
        {children || "—"}
      </dd>
    </div>
  );
}

const SiNo = ({ si }: { si: boolean }) => (
  <Badge
    variant={si ? "secondary" : "outline"}
    className={si ? "text-success" : "text-muted-foreground"}
  >
    {si ? "Sí" : "No"}
  </Badge>
);

export default async function MiEmpresa() {
  const contexto = await requerirCliente();
  const db = await obtenerDb();
  const [cliente, empresa, notas, actividad] = await Promise.all([
    obtenerCliente(db, contexto.clienteId),
    obtenerEmpresaDelPortal(db, contexto.empresaId),
    notasDeEmpresa(db, contexto.empresaId, false),
    actividadDeEmpresa(db, contexto.empresaId, { esSofteam: false, limite: 15 }),
  ]);
  if (!cliente || !empresa) throw new Error("Empresa no encontrada");
  const d = cliente.domicilioFiscal;

  return (
    <>
      <EncabezadoPagina
        titulo="Mi empresa"
        descripcion="Datos de facturación, administradores y políticas de uso."
        acciones={<Badge variant="outline">Empresa #{empresa.numero}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" /> Facturación
            </CardTitle>
            <CardDescription>
              Para cambiar los datos fiscales escribinos a administracion@softeam.com.ar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Dato etiqueta="Razón social / titular">{cliente.nombreFactura}</Dato>
              <Dato etiqueta="CUIT">{formatearCuit(cliente.cuit)}</Dato>
              <Dato etiqueta="Condición IVA">{CONDICIONES_IVA_ETIQUETA[cliente.condicionIva]}</Dato>
              <Dato etiqueta="Cliente">#{cliente.numero}</Dato>
              <div className="sm:col-span-2">
                <Dato
                  etiqueta="Domicilio fiscal"
                  icono={<MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                >
                  {`${d.calle}, ${d.ciudad} (${d.codigoPostal}), ${d.provincia}`}
                </Dato>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" /> Instalación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Dato etiqueta="Nombre">{empresa.nombre}</Dato>
              <Dato etiqueta="Nombre corto">{empresa.nombreCorto}</Dato>
              <Dato
                etiqueta="Tipo de instalación"
                icono={<ServerCog className="mt-0.5 size-4 text-muted-foreground" />}
              >
                {empresa.tipoInstalacion === "SAAS" ? "En la nube (SaaS)" : "En tus servidores"}
              </Dato>
              <Dato etiqueta="Oficinas">{empresa.oficinas}</Dato>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRoundCog className="size-4 text-primary" /> Administradores
            </CardTitle>
            <CardDescription>Quiénes pueden gestionar la cuenta en STLic.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {empresa.administradores.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.nombre}</p>
                    <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 break-all">
                        <Mail className="size-3" /> {a.email}
                      </span>
                      {a.telefono && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" /> {a.telefono}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {a.adminGeneral && <Badge>General</Badge>}
                    {a.adminComercial && <Badge variant="secondary">Paquetes y pagos</Badge>}
                    {a.adminOperativo && <Badge variant="secondary">Configuración</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-primary" /> Políticas de uso
            </CardTitle>
            <CardDescription>
              Cómo comparten las oficinas los recursos de la empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              {[
                [
                  "Las oficinas pueden enviar notificaciones a sus asegurados",
                  empresa.politicas.oficinasNotifican,
                ],
                [
                  "Si una oficina agota lo suyo, usa el saldo de la empresa",
                  empresa.politicas.oficinasUsanPozoEmpresa,
                ],
                [
                  "Las oficinas con administrador propio pueden contratar paquetes",
                  empresa.politicas.oficinasContratan,
                ],
              ].map(([texto, valor]) => (
                <div key={String(texto)} className="flex items-center justify-between gap-4">
                  <dt className="text-sm">{texto}</dt>
                  <dd>
                    <SiNo si={Boolean(valor)} />
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4">
                <dt className="text-sm">Tope mensual por oficina sobre el saldo de la empresa</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {empresa.politicas.topeMensualPozoPorOficina ?? "Sin tope"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {notas && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <StickyNote className="size-4 text-primary" /> Notas de SOFTeam
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{notas}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-primary" /> Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ListaActividad actividad={actividad} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
