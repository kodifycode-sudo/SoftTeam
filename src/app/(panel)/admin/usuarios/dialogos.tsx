"use client";

import { MailPlus, Send, UserMinus, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import {
  BotonEnviar,
  Campo,
  MensajeFormulario,
  useAvisoDeAccion as useAviso,
} from "@/components/formulario";
import { SelectNativo } from "@/components/select-nativo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { ROLES_SOFTEAM_INFO as ROLES } from "@/lib/roles";
import { cambiarRolAccion, invitarUsuarioAccion, reenviarInvitacionAccion } from "./acciones";

function ContenidoInvitar({ cerrar }: { cerrar: () => void }) {
  const [estado, accion] = useActionState(invitarUsuarioAccion, ESTADO_INICIAL);
  useAviso(estado, cerrar);
  return (
    <form action={accion} className="space-y-5">
      {!estado.ok && estado.errores && <MensajeFormulario estado={estado} />}
      <FieldGroup>
        <Campo nombre="nombre" etiqueta="Nombre y apellido" estado={estado} />
        <Campo
          nombre="email"
          etiqueta="Mail"
          type="email"
          placeholder="nombre@softeam.com.ar"
          estado={estado}
        />
        <Field>
          <FieldLabel htmlFor="rol">Rol</FieldLabel>
          <SelectNativo id="rol" name="rol" defaultValue={estado.valores?.rol ?? "SOPORTE"}>
            {Object.entries(ROLES).map(([valor, r]) => (
              <option key={valor} value={valor}>
                {r.etiqueta}
              </option>
            ))}
          </SelectNativo>
          <FieldDescription>
            Recibe un mail para elegir su contraseña y entrar al panel.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>
          <MailPlus data-icon="inline-start" /> Enviar invitación
        </BotonEnviar>
      </DialogFooter>
    </form>
  );
}

export function InvitarUsuario() {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" />}>
        <UserPlus data-icon="inline-start" /> Invitar usuario
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar a alguien de SOFTeam</DialogTitle>
          <DialogDescription>El rol define qué puede ver y hacer en el panel.</DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoInvitar cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Cambio de rol en el lugar: se guarda al elegir. */
export function SelectorRol({ id, rol, nombre }: { id: string; rol: string; nombre: string }) {
  const [estado, accion, enviando] = useActionState(cambiarRolAccion, ESTADO_INICIAL);
  useAviso(estado);
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <SelectNativo
        name="rol"
        defaultValue={rol}
        key={rol}
        aria-label={`Rol de ${nombre}`}
        disabled={enviando}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-40"
      >
        {Object.entries(ROLES).map(([valor, r]) => (
          <option key={valor} value={valor}>
            {r.etiqueta}
          </option>
        ))}
      </SelectNativo>
    </form>
  );
}

function ContenidoQuitar({
  id,
  nombre,
  cerrar,
}: {
  id: string;
  nombre: string;
  cerrar: () => void;
}) {
  // Al quitar el acceso, la fila (y con ella este diálogo) desaparece en la
  // misma actualización que trae la respuesta: el aviso se muestra desde el
  // envío, que no depende de que el componente siga montado.
  async function quitar(datos: FormData) {
    const resultado = await cambiarRolAccion(ESTADO_INICIAL, datos);
    if (!resultado.mensaje) return;
    if (resultado.ok) {
      toast.success(resultado.mensaje);
      cerrar();
    } else {
      toast.error(resultado.mensaje);
    }
  }
  return (
    <form action={quitar}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="rol" value="SIN_ACCESO" />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar variant="destructive">
          <UserMinus data-icon="inline-start" /> Quitar acceso a {nombre}
        </BotonEnviar>
      </DialogFooter>
    </form>
  );
}

export function QuitarAcceso({ id, nombre }: { id: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <UserMinus data-icon="inline-start" /> Quitar acceso
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Quitar el acceso al panel?</DialogTitle>
          <DialogDescription>
            {nombre} deja de poder entrar al panel SOFTeam y se cierran sus sesiones abiertas. Podés
            volver a invitarlo cuando quieras.
          </DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoQuitar id={id} nombre={nombre} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function ReenviarInvitacion({ email }: { email: string }) {
  const [estado, accion, enviando] = useActionState(reenviarInvitacionAccion, ESTADO_INICIAL);
  useAviso(estado);
  return (
    <form action={accion}>
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="ghost" size="sm" disabled={enviando}>
        <Send data-icon="inline-start" /> Reenviar invitación
      </Button>
    </form>
  );
}
