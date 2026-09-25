import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { salir } from "@/app/(auth)/acciones";
import { EstadoPagina } from "@/components/estado-pagina";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sin acceso" };

export default function SinAcceso() {
  return (
    <EstadoPagina
      icono={KeyRound}
      titulo="Tu usuario no administra ninguna empresa"
      texto="Ingresaste bien, pero tu usuario no tiene permisos de administración en STLic. Pedile al administrador de tu empresa que te los asigne."
      acciones={
        <form action={salir}>
          <Button type="submit" variant="outline">
            Cerrar sesión
          </Button>
        </form>
      }
    />
  );
}
