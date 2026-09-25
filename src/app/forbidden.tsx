import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { EstadoPagina } from "@/components/estado-pagina";
import { buttonVariants } from "@/components/ui/button";

export default function Prohibido() {
  return (
    <EstadoPagina
      icono={ShieldAlert}
      codigo="403"
      titulo="No tenés permiso para ver esto"
      texto="Tu rol no incluye esta sección. Si creés que es un error, pedile acceso a Administración."
      acciones={
        <Link href="/" className={buttonVariants()}>
          Volver
        </Link>
      }
    />
  );
}
