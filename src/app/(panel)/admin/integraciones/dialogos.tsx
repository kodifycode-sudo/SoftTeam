"use client";

import { Check, Copy, KeyRound, Pencil, Plus, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { FieldGroup } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import {
  actualizarWebhookAccion,
  crearSistemaAccion,
  type EstadoSecreto,
  rotarSecretoAccion,
} from "./acciones";

/** Muestra un secreto recién generado, una única vez, con botón para copiarlo. */
function SecretoUnaVez({ sistema, secreto }: { sistema: string; secreto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-4">
      <Alert className="border-warning/50 bg-warning/10">
        <TriangleAlert className="text-[oklch(0.5_0.13_70)]" />
        <AlertTitle>Guardalo ahora: no se vuelve a mostrar</AlertTitle>
        <AlertDescription>
          Entregáselo al equipo de <strong>{sistema}</strong> por un canal seguro. Si se pierde,
          generá uno nuevo.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-sm">{secreto}</code>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Copiar secreto"
          onClick={async () => {
            await navigator.clipboard.writeText(secreto);
            setCopiado(true);
          }}
        >
          {copiado ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

/*
 * El estado de la acción (que trae el secreto) vive en el contenido del
 * diálogo, que solo se monta mientras está abierto: al cerrarlo se destruye
 * y el secreto no reaparece al volver a abrir.
 */

function ContenidoNuevoSistema() {
  const [estado, accion] = useActionState<EstadoSecreto, FormData>(
    crearSistemaAccion,
    ESTADO_INICIAL,
  );
  if (estado.ok && estado.secreto && estado.sistema) {
    return (
      <>
        <SecretoUnaVez sistema={estado.sistema} secreto={estado.secreto} />
        <DialogFooter>
          <DialogClose render={<Button />}>Listo, lo guardé</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={accion} className="space-y-5">
      <MensajeFormulario estado={estado} />
      <FieldGroup>
        <Campo
          nombre="sistema"
          etiqueta="Identificador"
          placeholder="prodigal"
          ayuda="Va en la cabecera x-stlic-sistema."
          estado={estado}
        />
        <Campo nombre="nombre" etiqueta="Nombre" placeholder="Prodigal" estado={estado} />
        <Campo
          nombre="webhookUrl"
          etiqueta="Webhook (opcional)"
          type="url"
          placeholder="https://prodigal.softeam.com.ar/stlic/avisos"
          ayuda="Recibe un aviso cada vez que cambia una empresa."
          estado={estado}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Crear y generar secreto</BotonEnviar>
      </DialogFooter>
    </form>
  );
}

export function NuevoSistema() {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" />}>
        <Plus data-icon="inline-start" /> Nuevo sistema
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo sistema integrado</DialogTitle>
          <DialogDescription>
            Un producto que consulta licencias e informa consumos por la API.
          </DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoNuevoSistema />}
      </DialogContent>
    </Dialog>
  );
}

function ContenidoRotarSecreto({ id, sistema }: { id: string; sistema: string }) {
  const [estado, accion] = useActionState<EstadoSecreto, FormData>(
    rotarSecretoAccion,
    ESTADO_INICIAL,
  );
  if (estado.ok && estado.secreto) {
    return (
      <>
        <SecretoUnaVez sistema={sistema} secreto={estado.secreto} />
        <DialogFooter>
          <DialogClose render={<Button />}>Listo, lo guardé</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sistema" value={sistema} />
      <MensajeFormulario estado={estado} />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar variant="destructive">Generar secreto nuevo</BotonEnviar>
      </DialogFooter>
    </form>
  );
}

export function RotarSecreto({ id, sistema }: { id: string; sistema: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <KeyRound data-icon="inline-start" /> Rotar secreto
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rotar el secreto de {sistema}</DialogTitle>
          <DialogDescription>
            El secreto actual deja de funcionar en el acto: {sistema} no va a poder llamar a la API
            hasta que configure el nuevo.
          </DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoRotarSecreto id={id} sistema={sistema} />}
      </DialogContent>
    </Dialog>
  );
}

export function EditarWebhook({
  id,
  sistema,
  webhookUrl,
}: {
  id: string;
  sistema: string;
  webhookUrl: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState(actualizarWebhookAccion, ESTADO_INICIAL);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <Pencil data-icon="inline-start" /> Webhook
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Webhook de {sistema}</DialogTitle>
          <DialogDescription>
            Vacío: el sistema no recibe avisos y consulta por su cuenta.
          </DialogDescription>
        </DialogHeader>
        <form action={accion} className="space-y-5">
          <input type="hidden" name="id" value={id} />
          <MensajeFormulario estado={estado} />
          <Campo
            nombre="webhookUrl"
            etiqueta="URL"
            type="url"
            defaultValue={webhookUrl ?? ""}
            estado={estado}
          />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cerrar</DialogClose>
            <BotonEnviar>Guardar</BotonEnviar>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
