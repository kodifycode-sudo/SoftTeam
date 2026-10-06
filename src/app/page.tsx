import {
  ArrowRight,
  BellRing,
  Calculator,
  CreditCard,
  FolderKanban,
  Gauge,
  MapPinned,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MarcaStlic } from "@/components/marca";
import { SelectorTema } from "@/components/tema";
import { buttonVariants } from "@/components/ui/button";
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

const PRODUCTOS = [
  { icono: FolderKanban, nombre: "Prodigal" },
  { icono: Calculator, nombre: "CotiWeb" },
  { icono: Smartphone, nombre: "BienSeguro" },
  { icono: BellRing, nombre: "Notificaciones" },
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

        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-20 sm:px-6 sm:pt-20 sm:pb-28">
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
            {PRODUCTOS.map(({ icono: Icono, nombre }) => (
              <li key={nombre} className="flex items-center gap-2">
                <Icono className="size-4 text-brand" /> {nombre}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
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

      <footer className="mt-auto border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>SOFTeam Sistemas · de Contacto Asegurado SRL</span>
          <a href="https://softeam.com.ar/st/" className="hover:text-foreground" rel="noopener">
            softeam.com.ar
          </a>
        </div>
      </footer>
    </div>
  );
}
