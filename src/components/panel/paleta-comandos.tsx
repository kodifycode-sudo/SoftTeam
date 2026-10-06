"use client";

import { Hash, Headset, Monitor, Moon, Search, Sun, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cambiarTema } from "@/components/tema";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { seccionesVisibles, type VariantePanel } from "./navegacion";

const sinSuscripcion = () => () => {};

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Coincidencia por texto, sin acentos ("parame" → Parámetros). El filtro
 * difuso de cmdk saltea letras y "sur" coincidía con "Grupos".
 */
const filtrar = (valor: string, busqueda: string) =>
  normalizar(valor).includes(normalizar(busqueda.trim())) ? 1 : 0;

/** En Mac el atajo se muestra con ⌘; en el resto, con Ctrl (también en el servidor). */
function useEsMac() {
  return useSyncExternalStore(
    sinSuscripcion,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

/**
 * Paleta de comandos (Ctrl+K / ⌘K): ir a cualquier sección del menú, buscar
 * clientes, órdenes o pedidos sin pasar por el listado, y cambiar el tema.
 * Muestra solo lo que el menú lateral le muestra al usuario.
 */
export function PaletaComandos({
  variante,
  permisos,
}: {
  variante: VariantePanel;
  permisos: readonly string[];
}) {
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const router = useRouter();
  const esMac = useEsMac();
  const secciones = seccionesVisibles(variante, permisos);
  const visibles = new Set(secciones.flatMap((s) => s.items.map((i) => i.href)));

  useEffect(() => {
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key.toLowerCase() === "k" && (evento.metaKey || evento.ctrlKey)) {
        evento.preventDefault();
        setAbierta((a) => !a);
      }
    };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  }, []);

  const ir = (href: string) => {
    setAbierta(false);
    setTexto("");
    router.push(href);
  };

  const consulta = texto.trim();
  const numero = /^#?\d+$/.test(consulta) ? consulta.replace("#", "") : "";
  const busquedas = [
    visibles.has("/admin/clientes") && {
      clave: "clientes",
      icono: UsersRound,
      texto: `Buscar “${consulta}” en Clientes`,
      href: `/admin/clientes?q=${encodeURIComponent(consulta)}`,
    },
    visibles.has("/admin/ordenes") &&
      numero && {
        clave: "orden",
        icono: Hash,
        texto: `Buscar la orden N.º ${numero}`,
        href: `/admin/ordenes?estado=&q=${numero}`,
      },
    visibles.has("/admin/soporte") && {
      clave: "soporte",
      icono: Headset,
      texto: `Buscar “${consulta}” en Soporte`,
      href: `/admin/soporte?estado=ABIERTOS&q=${encodeURIComponent(consulta)}`,
    },
  ].filter((b) => !!b);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setAbierta(true)}
        className="h-8 shrink-0 gap-2 px-2 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
        aria-label="Buscar o ir a… (Ctrl+K)"
      >
        <Search />
        <span className="hidden flex-1 text-left font-normal sm:inline">Buscar o ir a…</span>
        <KbdGroup className="hidden sm:inline-flex">
          <Kbd>{esMac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog
        open={abierta}
        onOpenChange={(a) => {
          setAbierta(a);
          if (!a) setTexto("");
        }}
        title="Buscar o ir a"
        description="Escribí para filtrar las secciones o buscar."
      >
        <Command filter={filtrar}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder={
              variante === "admin" ? "Sección, cliente, N.º de orden…" : "¿A dónde querés ir?"
            }
          />
          <CommandList>
            {!(consulta && busquedas.length > 0) && (
              <CommandEmpty>No hay coincidencias.</CommandEmpty>
            )}
            {secciones.map((seccion) => (
              <CommandGroup key={seccion.titulo} heading={seccion.titulo}>
                {seccion.items.map((item) => (
                  <CommandItem
                    key={item.href}
                    value={`${seccion.titulo} ${item.etiqueta}`}
                    onSelect={() => ir(item.href)}
                  >
                    <item.icono />
                    {item.etiqueta}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandSeparator />
            <CommandGroup heading="Tema">
              {(
                [
                  ["claro", "Tema claro", Sun],
                  ["oscuro", "Tema oscuro", Moon],
                  ["sistema", "Tema del sistema", Monitor],
                ] as const
              ).map(([tema, etiqueta, Icono]) => (
                <CommandItem
                  key={tema}
                  value={etiqueta}
                  onSelect={() => {
                    cambiarTema(tema);
                    setAbierta(false);
                  }}
                >
                  <Icono />
                  {etiqueta}
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Al final: si el texto coincide con una sección, Enter va ahí; si no, busca. */}
            {consulta && busquedas.length > 0 && (
              <CommandGroup heading="Buscar" forceMount>
                {busquedas.map((b) => (
                  <CommandItem
                    key={b.clave}
                    value={`buscar-${b.clave}`}
                    forceMount
                    onSelect={() => ir(b.href)}
                  >
                    <b.icono />
                    {b.texto}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
