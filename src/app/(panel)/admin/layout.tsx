import { EstructuraPanel } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { requerirSofteam } from "@/server/auth/sesion";

const ROLES = {
  ADMINISTRACION: "Administración SOFTeam",
  COMERCIAL: "Comercial SOFTeam",
  SOPORTE: "Soporte SOFTeam",
} as const;

export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const { user, rol } = await requerirSofteam();
  return (
    <EstructuraPanel
      variante="admin"
      usuario={{
        nombre: user.name,
        email: user.email,
        rol: ROLES[rol],
        seguridad: "/admin/seguridad",
      }}
      permisos={[rol]}
      encabezado={
        <>
          <span className="truncate text-sm font-medium">Panel SOFTeam</span>
          <Badge variant="outline" className="hidden border-brand/40 bg-brand/10 sm:inline-flex">
            {ROLES[rol]}
          </Badge>
        </>
      }
    >
      {children}
    </EstructuraPanel>
  );
}
