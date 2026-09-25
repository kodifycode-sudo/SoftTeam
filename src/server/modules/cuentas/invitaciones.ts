import "server-only";
import { env } from "@/env";
import { enviarMail } from "@/server/email/enviar";
import type { UsuarioLogin } from "./usuarios";

/**
 * Avisa a una persona que le dieron acceso. Si todavía no eligió contraseña,
 * el enlace la lleva a activarlo (recibe un código y elige su contraseña); si
 * ya tenía usuario, solo tiene que ingresar.
 */
export async function enviarInvitacion(usuario: UsuarioLogin, destino: string): Promise<void> {
  const base = env.BETTER_AUTH_URL.replace(/\/$/, "");
  const activar = !usuario.verificado;
  const url = activar
    ? `${base}/recuperar?invitacion=1&email=${encodeURIComponent(usuario.email)}`
    : `${base}/ingresar?email=${encodeURIComponent(usuario.email)}`;
  try {
    await enviarMail({
      para: usuario.email,
      asunto: `Te dieron acceso a ${destino} en STLic`,
      parrafos: [
        `Hola ${usuario.nombre},`,
        `Ya podés administrar ${destino} en STLic, la plataforma de licencias de SOFTeam.`,
        activar
          ? "Para empezar, elegí tu contraseña: te vamos a enviar un código a este mail."
          : "Ingresá con tu mail y tu contraseña de siempre.",
      ],
      enlace: { texto: activar ? "Activar mi acceso" : "Ingresar a STLic", url },
      pie: "Si no esperabas este mail, podés ignorarlo.",
    });
  } catch (error) {
    // El acceso ya quedó dado: si el mail falla, se puede reenviar desde la pantalla.
    console.error("[invitaciones] no se pudo enviar el mail", error);
  }
}
