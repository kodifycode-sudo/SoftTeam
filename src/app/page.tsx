import {
  ArrowRight,
  ChevronDown,
  CreditCard,
  Gauge,
  MapPinned,
  MessageCircleQuestion,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PieLegal } from "@/components/legal";
import { MarcaStlic } from "@/components/marca";
import { SelectorTema } from "@/components/tema";
import { buttonVariants } from "@/components/ui/button";
import { RESPONSABLE } from "@/lib/legal";
import { PRODUCTOS_PRINCIPALES } from "@/lib/productos";
import { obtenerSesion } from "@/server/auth/sesion";

const BENEFICIOS = [
  {
    icono: Gauge,
    titulo: "Tu licencia, siempre a la vista",
    texto:
      "Usuarios, pólizas, cotizaciones y notificaciones disponibles, con avisos antes de que venzan.",
  },
  {
    icono: CreditCard,
    titulo: "Contratá y renová cuando quieras",
    texto: "Elegí paquetes, el medio de pago que prefieras y la renovación automática.",
  },
  {
    icono: MapPinned,
    titulo: "Oficinas, usuarios y productores",
    texto: "Organizá tu broker como trabaja: sucursales, canales y permisos por usuario.",
  },
  {
    icono: ShieldCheck,
    titulo: "Seguro y auditado",
    texto: "Acceso verificado, cada cambio registrado y tus datos protegidos.",
  },
];

/** Respuestas tomadas de lo que el portal hace (registro, órdenes, renovación, perfiles, soporte). */
const PREGUNTAS = [
  {
    pregunta: "¿Cómo empiezo?",
    respuesta:
      "Registrá tu empresa con su CUIT y sus datos fiscales, y confirmá tu mail con el código que te enviamos. Creamos la cuenta con la oficina Casa central y ya podés elegir los paquetes que necesitás.",
  },
  {
    pregunta: "¿Cómo se paga?",
    respuesta:
      "Al confirmar el carrito se genera una orden que pagás por transferencia bancaria o en línea con Mercado Pago, según los medios habilitados. Los precios del catálogo no incluyen IVA y la factura electrónica queda disponible en el portal.",
  },
  {
    pregunta: "¿Qué pasa cuando vence un paquete?",
    respuesta:
      "Si tiene la renovación automática activa, generamos la orden de renovación antes del vencimiento para que llegues a pagarla. Podés desactivarla, o renovar a mano y elegir otra duración, por ejemplo pasar de mensual a anual.",
  },
  {
    pregunta: "¿Puedo sumar productos o capacidad después?",
    respuesta:
      "Sí. Tu licencia es la suma de los paquetes que tengas vigentes: sumás usuarios, pólizas, cotizaciones o productos cuando los necesites. Los créditos sin vencimiento se usan hasta agotarse.",
  },
  {
    pregunta: "¿Puedo darle acceso a mi equipo?",
    respuesta:
      "Sí. Cada persona tiene su usuario con un perfil (administración general, comercial u operativa), y podés organizar oficinas y canales con administradores delegados que manejan solo lo suyo.",
  },
  {
    pregunta: "¿Cómo pido soporte?",
    respuesta:
      "Desde el portal: cada pedido usa un ticket de soporte de tu licencia y lo seguís en el mismo lugar, con las respuestas y los adjuntos.",
  },
];

export default async function Inicio() {
  const sesion = await obtenerSesion();
  if (sesion) redirect(sesion.user.rolSofteam ? "/admin" : "/portal");

  return (
    <div className="flex min-h-svh flex-col">
      <section className="fondo-grilla relative overflow-hidden bg-navy text-navy-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 right-0 size-[32rem] rounded-full bg-brand/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-48 -left-32 size-[30rem] rounded-full bg-primary/30 blur-3xl"
        />

        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <MarcaStlic />
          <div className="flex items-center gap-1">
            <SelectorTema className="text-navy-foreground hover:bg-white/10 hover:text-white" />
            <Link
              href="/ingresar"
              className={buttonVariants({
                variant: "ghost",
                className: "text-navy-foreground hover:bg-white/10 hover:text-white",
              })}
            >
              Ingresar
            </Link>
          </div>
        </header>

        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-32 sm:px-6 sm:pt-20 sm:pb-52">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-brand">
            Portal de clientes de SOFTeam Sistemas
          </p>
          <h1 className="max-w-3xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Administrá las licencias de tu broker{" "}
            <span className="text-brand">sin llamar a nadie.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-pretty text-navy-foreground/70">
            Contratá, renová y seguí el uso de Prodigal, CotiWeb, BienSeguro y Boletín C@ desde un
            solo lugar.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/registro"
              className={buttonVariants({
                size: "lg",
                className: "h-11 bg-brand px-6 text-brand-foreground hover:bg-brand/90",
              })}
            >
              Registrá tu empresa <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href="/ingresar"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className:
                  "h-11 border-white/20 bg-white/5 px-6 text-navy-foreground hover:bg-white/10 hover:text-white",
              })}
            >
              Ya tengo cuenta
            </Link>
          </div>
          <ul className="mt-14 flex flex-wrap gap-x-8 gap-y-3 text-sm text-navy-foreground/60">
            {PRODUCTOS_PRINCIPALES.map(({ icono: Icono, nombre }) => (
              <li key={nombre} className="flex items-center gap-2">
                <Icono className="size-4 text-brand" /> {nombre}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Captura real del portal, montada sobre el borde del encabezado. */}
      <section aria-label="Así se ve el portal" className="relative px-4 sm:px-6">
        <figure className="mx-auto -mt-20 max-w-5xl overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-navy/20 sm:-mt-36">
          <div aria-hidden className="flex items-center gap-1.5 border-b bg-muted/60 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-destructive/60" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-success/60" />
          </div>
          <Image
            src="/marca/portal-claro.png"
            alt="Inicio del portal: la licencia de la empresa por producto y los vencimientos de sus paquetes."
            width={2560}
            height={1600}
            sizes="(min-width: 1024px) 1024px, 100vw"
            priority
            className="h-auto w-full dark:hidden"
          />
          <Image
            src="/marca/portal-oscuro.png"
            alt="Inicio del portal: la licencia de la empresa por producto y los vencimientos de sus paquetes."
            width={2560}
            height={1600}
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="hidden h-auto w-full dark:block"
          />
        </figure>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-16 sm:grid-cols-2 sm:px-6 sm:py-20 lg:grid-cols-4">
        {BENEFICIOS.map(({ icono: Icono, titulo, texto }) => (
          <div key={titulo} className="rounded-2xl border bg-card p-6 shadow-xs">
            <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icono className="size-5" />
            </span>
            <h2 className="font-semibold">{titulo}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{texto}</p>
          </div>
        ))}
      </section>

      <section
        aria-labelledby="preguntas"
        className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
      >
        <div className="space-y-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand/20 text-[oklch(0.5_0.13_75)] dark:text-brand">
            <MessageCircleQuestion className="size-5" />
          </span>
          <h2 id="preguntas" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Preguntas frecuentes
          </h2>
          <p className="text-muted-foreground">
            Lo que más nos consultan antes de empezar. ¿Te queda alguna duda?{" "}
            <a href={RESPONSABLE.sitio} className="text-primary underline-offset-4 hover:underline">
              Escribinos
            </a>
            .
          </p>
        </div>
        <div className="divide-y rounded-2xl border bg-card">
          {PREGUNTAS.map(({ pregunta, respuesta }) => (
            <details key={pregunta} className="group px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                {pregunta}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-pretty text-muted-foreground">
                {respuesta}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="fondo-grilla relative overflow-hidden bg-navy text-navy-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Tu licencia, tus pagos y tu equipo,{" "}
            <span className="text-brand">en un solo lugar.</span>
          </h2>
          <p className="max-w-xl text-pretty text-navy-foreground/70">
            Registrá tu empresa en minutos o ingresá si ya tenés cuenta.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/registro"
              className={buttonVariants({
                size: "lg",
                className: "h-11 bg-brand px-6 text-brand-foreground hover:bg-brand/90",
              })}
            >
              Registrá tu empresa <ArrowRight data-icon="inline-end" />
            </Link>
            <a
              href={RESPONSABLE.sitio}
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className:
                  "h-11 border-white/20 bg-white/5 px-6 text-navy-foreground hover:bg-white/10 hover:text-white",
              })}
            >
              Hablar con SOFTeam
            </a>
          </div>
        </div>
      </section>

      <PieLegal />
    </div>
  );
}
