import { BadgeCheck, Calculator, FolderKanban, Newspaper, Smartphone } from "lucide-react";
import Link from "next/link";
import { LogoSofteam, MarcaStlic } from "@/components/marca";
import { SelectorTema } from "@/components/tema";

const PRODUCTOS = [
  { icono: FolderKanban, nombre: "Prodigal", detalle: "Gestión de cartera" },
  { icono: Calculator, nombre: "CotiWeb", detalle: "Multicotización y emisión" },
  { icono: Smartphone, nombre: "BienSeguro", detalle: "Portal y app para asegurados" },
  { icono: Newspaper, nombre: "Boletín C@", detalle: "Comunicación con tus clientes" },
];

export default function LayoutAcceso({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="fondo-grilla relative hidden flex-col justify-between overflow-hidden bg-navy p-10 text-navy-foreground lg:flex xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-brand/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-primary/30 blur-3xl"
        />

        <Link href="/" className="relative w-fit">
          <MarcaStlic />
        </Link>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-brand">
              <BadgeCheck className="size-3.5" /> 30 años acompañando a brokers de seguros
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Todo lo que tu broker contrata, <span className="text-brand">en un solo lugar.</span>
            </h1>
            <p className="text-pretty text-base text-navy-foreground/70">
              Contratá y renová tus paquetes, administrá usuarios y oficinas, y seguí tus consumos
              sin depender de nadie.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {PRODUCTOS.map(({ icono: Icono, nombre, detalle }) => (
              <li
                key={nombre}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition-colors hover:bg-white/[0.07]"
              >
                <Icono className="mb-3 size-5 text-brand" />
                <p className="font-medium">{nombre}</p>
                <p className="text-sm text-navy-foreground/60">{detalle}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-navy-foreground/50">
          SOFTeam Sistemas · de Contacto Asegurado SRL
        </p>
      </aside>

      <main className="relative flex flex-col items-center px-4 py-8 sm:px-8 sm:py-12 lg:justify-center">
        <SelectorTema className="absolute top-3 right-3 sm:top-4 sm:right-4" />
        <Link href="/" className="mb-8 lg:hidden">
          <LogoSofteam className="h-9" />
        </Link>
        {children}
      </main>
    </div>
  );
}
