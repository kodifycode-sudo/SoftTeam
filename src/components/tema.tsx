"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CLAVE_TEMA, type Tema } from "@/lib/tema";
import { cn } from "@/lib/utils";

const MEDIA_OSCURO = "(prefers-color-scheme: dark)";
/** Evento propio para avisar el cambio dentro de la misma pestaña. */
const EVENTO_TEMA = "stlic:tema";

function leerTema(): Tema {
  try {
    const tema = localStorage.getItem(CLAVE_TEMA);
    return tema === "claro" || tema === "oscuro" ? tema : "sistema";
  } catch {
    return "sistema";
  }
}

function esOscuro(tema: Tema): boolean {
  return tema === "oscuro" || (tema === "sistema" && matchMedia(MEDIA_OSCURO).matches);
}

function aplicarTema(oscuro: boolean) {
  const raiz = document.documentElement;
  raiz.classList.toggle("dark", oscuro);
  raiz.style.colorScheme = oscuro ? "dark" : "light";
}

/** Avisa ante cambios de preferencia (esta u otra pestaña) o del tema del sistema. */
function suscribir(aviso: () => void) {
  const media = matchMedia(MEDIA_OSCURO);
  window.addEventListener(EVENTO_TEMA, aviso);
  window.addEventListener("storage", aviso);
  media.addEventListener("change", aviso);
  return () => {
    window.removeEventListener(EVENTO_TEMA, aviso);
    window.removeEventListener("storage", aviso);
    media.removeEventListener("change", aviso);
  };
}

export function cambiarTema(tema: Tema) {
  try {
    if (tema === "sistema") localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento (modo privado): el cambio vale solo para esta página.
  }
  aplicarTema(esOscuro(tema));
  window.dispatchEvent(new Event(EVENTO_TEMA));
}

/** Preferencia elegida ("sistema" durante el render del servidor). */
export function useTema(): Tema {
  return useSyncExternalStore(suscribir, leerTema, () => "sistema");
}

/** Tema efectivo, ya resuelto contra el sistema operativo. */
export function useTemaOscuro(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => esOscuro(leerTema()),
    () => false,
  );
}

/**
 * Mantiene la clase `dark` de `<html>` al día: la reaplica tras el remontaje
 * de desarrollo (React limpia los atributos que puso el script), sigue los
 * cambios del sistema y de otras pestañas, e imprime siempre en claro.
 */
export function SincronizarTema() {
  useLayoutEffect(() => {
    const sincronizar = () => aplicarTema(esOscuro(leerTema()));
    const antesDeImprimir = () => aplicarTema(false);
    sincronizar();
    const desuscribir = suscribir(sincronizar);
    window.addEventListener("beforeprint", antesDeImprimir);
    window.addEventListener("afterprint", sincronizar);
    return () => {
      desuscribir();
      window.removeEventListener("beforeprint", antesDeImprimir);
      window.removeEventListener("afterprint", sincronizar);
    };
  }, []);
  return null;
}

const OPCIONES = [
  { valor: "claro", etiqueta: "Claro", icono: Sun },
  { valor: "oscuro", etiqueta: "Oscuro", icono: Moon },
  { valor: "sistema", etiqueta: "Sistema", icono: Monitor },
] as const;

/** Botón con menú para elegir tema claro, oscuro o el del sistema. */
export function SelectorTema({ className }: { className?: string }) {
  const tema = useTema();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className={cn("shrink-0", className)} />}
      >
        {/* El ícono sale de la clase `dark`, no del estado: así coincide con el HTML del servidor. */}
        <Sun className="dark:hidden" />
        <Moon className="hidden dark:block" />
        <span className="sr-only">Cambiar tema</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup value={tema} onValueChange={(valor) => cambiarTema(valor as Tema)}>
          {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => (
            <DropdownMenuRadioItem key={valor} value={valor}>
              <Icono /> {etiqueta}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
