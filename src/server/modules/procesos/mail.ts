import "server-only";
import { enviarMail } from "@/server/email/enviar";
import type { EnviarAlerta } from "./alertas";

/** Envía un aviso por mail a cada persona que administra la cuenta. */
export const enviarAlertaPorMail: EnviarAlerta = async (mail) => {
  for (const para of mail.para) {
    await enviarMail({
      para,
      asunto: mail.asunto,
      parrafos: ["Hola,", `${mail.empresa}: ${mail.mensaje}`],
      pie: "Recibís este aviso porque administrás la cuenta en STLic.",
    });
  }
};
