import "server-only";
import { env } from "@/env";

export interface Mail {
  para: string;
  asunto: string;
  /** Texto principal, en párrafos. */
  parrafos: string[];
  /** Código destacado (verificación). */
  codigo?: string;
  /** Botón con un enlace (invitaciones). */
  enlace?: { texto: string; url: string };
  pie?: string;
}

const escapar = (texto: string) =>
  texto.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/** Plantilla simple con la marca, compatible con los clientes de correo más comunes. */
function html(mail: Mail): string {
  const parrafos = mail.parrafos
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escapar(p)}</p>`)
    .join("");
  const codigo = mail.codigo
    ? `<div style="margin:24px 0;padding:18px;border-radius:12px;background:#f0f5fa;text-align:center;font:600 32px/1 ui-monospace,Menlo,monospace;letter-spacing:10px;color:#0f1b2d">${escapar(mail.codigo)}</div>`
    : "";
  const enlace = mail.enlace
    ? `<p style="margin:24px 0"><a href="${escapar(mail.enlace.url)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0f1b2d;color:#fff;font-weight:600;text-decoration:none">${escapar(mail.enlace.texto)}</a></p>`
    : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f0f5fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0f1b2d;padding:20px 28px;color:#fff;font-weight:700;font-size:18px">SOFTeam <span style="color:#fbc02d">·</span> STLic</td></tr>
<tr><td style="height:4px;background:#fbc02d"></td></tr>
<tr><td style="padding:28px">${parrafos}${codigo}${enlace}
<p style="margin:24px 0 0;font-size:13px;color:#475569">${escapar(mail.pie ?? "Si no pediste este mail, podés ignorarlo.")}</p></td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Envía un mail. Sin clave de Resend (desarrollo o ambiente de pruebas), lo
 * muestra en la consola del servidor: así se prueba el alta sin configurar nada.
 */
export async function enviarMail(mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.info(
      `\n📧 [mail de desarrollo] Para: ${mail.para}\n   Asunto: ${mail.asunto}${
        mail.codigo ? `\n   Código: ${mail.codigo}` : ""
      }${mail.enlace ? `\n   Enlace: ${mail.enlace.url}` : ""}\n`,
    );
    return;
  }
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_REMITENTE,
      to: [mail.para],
      subject: mail.asunto,
      html: html(mail),
      text: [...mail.parrafos, mail.codigo ?? "", mail.enlace?.url ?? "", mail.pie ?? ""]
        .filter(Boolean)
        .join("\n\n"),
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
}
