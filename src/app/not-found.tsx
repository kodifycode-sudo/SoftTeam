import { Compass } from "lucide-react";
import Link from "next/link";
import { EstadoPagina } from "@/components/estado-pagina";
import { buttonVariants } from "@/components/ui/button";

export default function NoEncontrada() {
  return (
    <EstadoPagina
      icono={Compass}
      codigo="404"
      titulo="No encontramos esta página"
      texto="Puede que el enlace esté mal escrito o que la página ya no exista."
      acciones={
        <Link href="/" className={buttonVariants()}>
          Ir al inicio
        </Link>
      }
    />
  );
}
