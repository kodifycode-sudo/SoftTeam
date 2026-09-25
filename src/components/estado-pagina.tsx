import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LogoSofteam } from "@/components/marca";

/** Pantalla completa para estados especiales (403, 404, sin acceso, error). */
export function EstadoPagina({
  icono: Icono,
  codigo,
  titulo,
  texto,
  acciones,
}: {
  icono: LucideIcon;
  codigo?: string;
  titulo: string;
  texto: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <LogoSofteam />
      <div className="max-w-md space-y-4">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/20 text-foreground">
          <Icono className="size-7" />
        </span>
        {codigo && <p className="font-mono text-sm text-muted-foreground">{codigo}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-muted-foreground">{texto}</p>
      </div>
      {acciones && <div className="flex flex-wrap justify-center gap-2">{acciones}</div>}
    </main>
  );
}
