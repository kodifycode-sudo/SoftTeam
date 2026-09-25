import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo oficial de SOFTeam (para fondos claros). */
export function LogoSofteam({ className }: { className?: string }) {
  return (
    <Image
      src="/marca/softeam.png"
      alt="SOFTeam Sistemas"
      width={501}
      height={101}
      priority
      className={cn("h-8 w-auto dark:invert", className)}
    />
  );
}

/** Logotipo de STLic para fondos oscuros (barra lateral, paneles azul marino). */
export function MarcaStlic({
  className,
  compacta = false,
}: {
  className?: string;
  compacta?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand font-black text-brand-foreground shadow-sm shadow-black/20">
        ST
      </span>
      {!compacta && (
        <span className="flex flex-col leading-none">
          <span className="font-semibold tracking-tight">
            SOFTeam <span className="text-brand">·</span> STLic
          </span>
          <span className="mt-1 text-[0.7rem] font-medium uppercase tracking-[0.14em] opacity-60">
            Licencias y cuentas
          </span>
        </span>
      )}
    </div>
  );
}
