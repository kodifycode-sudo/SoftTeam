import Link from "next/link";
import type { ReactNode } from "react";
import { MarcaStlic } from "@/components/marca";
import { SelectorTema } from "@/components/tema";
import { fechaCorta } from "@/lib/formato";
import { ACTUALIZACION_LEGAL, RESPONSABLE } from "@/lib/legal";

/** Página de texto legal: encabezado con la marca, índice y apartados numerados. */
export function DocumentoLegal({
  titulo,
  resumen,
  apartados,
  children,
}: {
  titulo: string;
  resumen: ReactNode;
  apartados: { id: string; titulo: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-navy text-navy-foreground print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/">
            <MarcaStlic />
          </Link>
          <SelectorTema className="text-navy-foreground hover:bg-white/10 hover:text-white" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-primary">
          Última actualización: {fechaCorta(ACTUALIZACION_LEGAL)}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {titulo}
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">{resumen}</p>

        <nav
          aria-label="Contenido"
          className="mt-8 rounded-2xl border bg-card p-5 text-sm print:hidden"
        >
          <p className="mb-3 font-medium">Contenido</p>
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {apartados.map((a, i) => (
              <li key={a.id}>
                <a
                  href={`#${a.id}`}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {i + 1}. {a.titulo}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">{children}</div>
      </main>
      <PieLegal />
    </div>
  );
}

/** Apartado numerado; el número sale del orden del índice. */
export function Apartado({
  id,
  numero,
  titulo,
  children,
}: {
  id: string;
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3 text-[0.95rem] leading-relaxed">
      <h2 className="text-xl font-semibold tracking-tight">
        <span className="mr-2 text-muted-foreground tabular-nums">{numero}.</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Lista con viñetas para los textos legales. */
export function Lista({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>;
}

/** Pie con los enlaces legales; lo comparten la portada, el acceso y estas páginas. */
export function PieLegal({ className }: { className?: string }) {
  return (
    <footer className={`border-t print:hidden ${className ?? ""}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {RESPONSABLE.marca} · de {RESPONSABLE.razonSocial}
        </p>
        <nav aria-label="Legales" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terminos" className="hover:text-foreground">
            Términos y condiciones
          </Link>
          <Link href="/privacidad" className="hover:text-foreground">
            Privacidad
          </Link>
          <a href={RESPONSABLE.sitio} className="hover:text-foreground">
            {RESPONSABLE.sitioTexto}
          </a>
        </nav>
      </div>
    </footer>
  );
}
