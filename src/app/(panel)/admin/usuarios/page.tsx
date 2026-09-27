import { Clock, MailQuestion, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fechaCorta } from "@/lib/formato";
import { ROLES_SOFTEAM_INFO as ROLES } from "@/lib/roles";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarUsuariosSofteam } from "@/server/modules/cuentas/usuarios-softeam";
import {
  InvitarUsuario,
  QuitarAcceso,
  QuitarDosFactores,
  ReenviarInvitacion,
  SelectorRol,
} from "./dialogos";

export const metadata: Metadata = { title: "Usuarios SOFTeam" };

type Usuario = Awaited<ReturnType<typeof listarUsuariosSofteam>>[number];

function Estado({ u }: { u: Usuario }) {
  if (!u.verificado) {
    return (
      <Badge variant="outline" className="gap-1 border-warning/60 bg-warning/10">
        <MailQuestion className="size-3" /> Invitación pendiente
      </Badge>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="size-3.5" />
      {u.ultimoIngreso ? `Último ingreso ${fechaCorta(u.ultimoIngreso)}` : "Nunca ingresó"}
      {u.dosFactores ? (
        <Badge variant="outline" className="gap-1 border-success/50 bg-success/10 text-success">
          <ShieldCheck className="size-3" /> 2FA
        </Badge>
      ) : (
        <Badge variant="outline">Sin 2FA</Badge>
      )}
    </span>
  );
}

function Acciones({ u, propio }: { u: Usuario; propio: boolean }) {
  if (propio) return <span className="text-xs text-muted-foreground">Sos vos</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {!u.verificado && <ReenviarInvitacion email={u.email} />}
      {u.dosFactores && <QuitarDosFactores id={u.id} nombre={u.nombre} />}
      <QuitarAcceso id={u.id} nombre={u.nombre} />
    </div>
  );
}

export default async function PaginaUsuariosSofteam() {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const usuarios = await listarUsuariosSofteam(await obtenerDb());

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios SOFTeam"
        descripcion="Quiénes entran al panel y con qué rol. Los cambios rigen en el acto."
        acciones={<InvitarUsuario />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {Object.entries(ROLES).map(([valor, r]) => (
          <Card key={valor} className="gap-1.5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-primary" /> {r.etiqueta}
              <Badge variant="secondary" className="ml-auto tabular-nums">
                {usuarios.filter((u) => u.rol === valor).length}
              </Badge>
            </p>
            <p className="text-xs text-muted-foreground">{r.descripcion}</p>
          </Card>
        ))}
      </div>

      {/* Celular: tarjetas */}
      <ul className="grid gap-3 md:hidden">
        {usuarios.map((u) => (
          <li key={u.id}>
            <Card className="gap-3 p-4">
              <div>
                <p className="font-medium">{u.nombre}</p>
                <p className="text-xs break-all text-muted-foreground">{u.email}</p>
              </div>
              <Estado u={u} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {u.id === user.id ? (
                  <Badge variant="secondary">{ROLES[u.rol as keyof typeof ROLES].etiqueta}</Badge>
                ) : (
                  <SelectorRol id={u.id} rol={u.rol ?? "SOPORTE"} nombre={u.nombre} />
                )}
                <Acciones u={u} propio={u.id === user.id} />
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
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-64" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-4">
                  <p className="font-medium">{u.nombre}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell>
                  {u.id === user.id ? (
                    <Badge variant="secondary">{ROLES[u.rol as keyof typeof ROLES].etiqueta}</Badge>
                  ) : (
                    <SelectorRol id={u.id} rol={u.rol ?? "SOPORTE"} nombre={u.nombre} />
                  )}
                </TableCell>
                <TableCell>
                  <Estado u={u} />
                </TableCell>
                <TableCell className="text-right">
                  <Acciones u={u} propio={u.id === user.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
