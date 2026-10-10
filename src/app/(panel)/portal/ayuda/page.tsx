import { ArrowRight, ChevronDown, CircleHelp, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { creditosDeSoporte, PRODUCTOS_SOPORTE } from "@/server/modules/soporte/incidentes";
import { NuevoIncidente } from "../soporte/nuevo";

export const metadata: Metadata = { title: "Ayuda" };

interface Pregunta {
  pregunta: string;
  respuesta: string;
  /** La pantalla donde se hace. */
  enlace?: { texto: string; href: string };
}

/** Cómo se hace cada cosa en el portal, con el botón y la pantalla donde está. */
const TEMAS: { titulo: string; preguntas: Pregunta[] }[] = [
  {
    titulo: "Tu equipo y tu organización",
    preguntas: [
      {
        pregunta: "¿Cómo le doy acceso a alguien de mi equipo?",
        respuesta:
          "En Usuarios, con «Nuevo usuario»: elegís su perfil y a qué productos accede; si le das acceso al portal, le llega un mail para activarlo. Lo hace un administrador general u operativo.",
        enlace: { texto: "Ir a Usuarios", href: "/portal/usuarios" },
      },
      {
        pregunta: "¿Cómo agrego una oficina o sucursal?",
        respuesta:
          "En Oficinas, con «Nueva oficina». Cada oficina pertenece a un canal y puede tener sus propios administradores delegados.",
        enlace: { texto: "Ir a Oficinas", href: "/portal/oficinas" },
      },
      {
        pregunta: "¿Cómo protejo mi cuenta?",
        respuesta:
          "Activá la verificación en dos pasos desde Seguridad de la cuenta (en el menú con tu nombre, abajo a la izquierda): además de la contraseña, te pedimos un código de tu celular.",
        enlace: { texto: "Ir a Seguridad", href: "/portal/seguridad" },
      },
    ],
  },
  {
    titulo: "Paquetes, pagos y renovaciones",
    preguntas: [
      {
        pregunta: "¿Cómo sumo capacidad o un producto?",
        respuesta:
          "En Paquetes disponibles elegís el paquete y su duración, lo agregás al carrito y lo confirmás: se genera una orden. Lo hace un administrador general o comercial.",
        enlace: { texto: "Ver paquetes", href: "/portal/paquetes" },
      },
      {
        pregunta: "¿Cómo pago una orden pendiente?",
        respuesta:
          "Entrá a la orden desde Mis órdenes. Si se paga en línea, usá «Pagar ahora»; si es por transferencia, la orden indica el medio de pago. El paquete se habilita al registrarse el pago.",
        enlace: { texto: "Ir a Mis órdenes", href: "/portal/ordenes" },
      },
      {
        pregunta: "¿Dónde veo el comprobante de un pago?",
        respuesta:
          "Cada orden pagada muestra su número de comprobante y un recibo que podés imprimir o guardar como PDF.",
        enlace: { texto: "Ir a Mis órdenes", href: "/portal/ordenes" },
      },
      {
        pregunta: "¿Cómo activo o desactivo la renovación automática?",
        respuesta:
          "En el inicio, en Vencimientos, cada paquete tiene su interruptor «Renovación automática». Se puede cambiar hasta que se genera la orden de renovación; también podés renovar a mano y elegir otra duración.",
        enlace: { texto: "Ir al inicio", href: "/portal#vencimientos" },
      },
    ],
  },
  {
    titulo: "Soporte",
    preguntas: [
      {
        pregunta: "¿Qué consultas usan un ticket de soporte?",
        respuesta:
          "Los pedidos de soporte técnico de los productos (Prodigal, CotiWeb, BienSeguro, Boletín@). Las consultas sobre tu cuenta, licencias, pagos y facturación son sin cargo.",
      },
      {
        pregunta: "¿Qué hago si me quedé sin tickets?",
        respuesta:
          "El cupo mensual se renueva el día 1. Si necesitás seguir ahora, sumá un paquete de soporte desde Créditos sin vencimiento. Mientras tanto podés consultarnos sobre tu cuenta sin cargo.",
        enlace: { texto: "Ver paquetes de soporte", href: "/portal/paquetes?tipo=CONSUMIBLE" },
      },
    ],
  },
];

export default async function Ayuda() {
  const contexto = await requerirCliente();
  const creditos = await creditosDeSoporte(await obtenerDb(), contexto.empresaId);

  return (
    <>
      <EncabezadoPagina
        titulo="Ayuda"
        descripcion="Cómo se hace cada cosa en el portal. Si no encontrás la respuesta, escribinos."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="space-y-8">
          {TEMAS.map((tema) => (
            <section
              key={tema.titulo}
              aria-labelledby={`tema-${tema.titulo}`}
              className="space-y-3"
            >
              <h2 id={`tema-${tema.titulo}`} className="text-lg font-semibold">
                {tema.titulo}
              </h2>
              <div className="divide-y rounded-2xl border bg-card">
                {tema.preguntas.map((p) => (
                  <details key={p.pregunta} className="group px-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                      {p.pregunta}
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-3 pb-5 text-sm leading-relaxed text-muted-foreground">
                      <p className="text-pretty">{p.respuesta}</p>
                      {p.enlace && (
                        <Link
                          href={p.enlace.href}
                          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {p.enlace.texto} <ArrowRight className="size-3.5" />
                        </Link>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <Card className="h-fit gap-4 p-6 lg:sticky lg:top-20">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <MessageSquareText className="size-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="font-semibold">¿No encontrás la respuesta?</h2>
            <p className="text-sm text-muted-foreground">
              Escribinos y te respondemos por el portal y por mail. Las consultas sobre tu cuenta,
              licencias y pagos no usan tickets.
            </p>
          </div>
          <NuevoIncidente
            productos={PRODUCTOS_SOPORTE}
            disponibles={creditos.disponibles}
            productoInicial="stlic"
            boton="Escribinos"
          />
          <Link
            href="/portal/soporte"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full" })}
          >
            <CircleHelp data-icon="inline-start" /> Ver mis pedidos
          </Link>
        </Card>
      </div>
    </>
  );
}
