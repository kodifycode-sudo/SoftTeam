import type { Metadata } from "next";
import { Apartado, DocumentoLegal, Lista } from "@/components/legal";
import { RESPONSABLE } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo trata STLic los datos personales, según la Ley 25.326.",
};

const APARTADOS = [
  { id: "responsable", titulo: "Responsable" },
  { id: "datos", titulo: "Qué datos tratamos" },
  { id: "finalidad", titulo: "Para qué los usamos" },
  { id: "terceros", titulo: "Con quién los compartimos" },
  { id: "conservacion", titulo: "Cuánto tiempo los guardamos" },
  { id: "seguridad", titulo: "Seguridad" },
  { id: "cookies", titulo: "Cookies y almacenamiento local" },
  { id: "derechos", titulo: "Tus derechos" },
  { id: "cambios", titulo: "Cambios en esta política" },
];

export default function Privacidad() {
  const n = (id: string) => APARTADOS.findIndex((a) => a.id === id) + 1;
  const enlace = "text-primary underline-offset-4 hover:underline";
  return (
    <DocumentoLegal
      titulo="Política de privacidad"
      resumen="Qué datos personales trata STLic, para qué, con quién los compartimos y cómo ejercer tus derechos, conforme a la Ley 25.326 de Protección de los Datos Personales."
      apartados={APARTADOS}
    >
      <Apartado id="responsable" numero={n("responsable")} titulo="Responsable">
        <p>
          El responsable de la base de datos es {RESPONSABLE.razonSocial} ({RESPONSABLE.marca}).
          Para consultas sobre tus datos, escribinos desde el soporte del portal o a través de{" "}
          <a href={RESPONSABLE.sitio} className={enlace}>
            {RESPONSABLE.sitioTexto}
          </a>
          .
        </p>
      </Apartado>

      <Apartado id="datos" numero={n("datos")} titulo="Qué datos tratamos">
        <Lista>
          <li>
            <strong>De la empresa:</strong> razón social, CUIT, condición frente al IVA, domicilio
            fiscal, teléfono y contactos de administración y pagos.
          </li>
          <li>
            <strong>De cada usuario:</strong> nombre, mail, rol y permisos, y si activó la
            verificación en dos pasos.
          </li>
          <li>
            <strong>Que carga tu empresa:</strong> productores (nombre, matrícula, CUIT, contacto),
            oficinas, canales y los mensajes y adjuntos de los pedidos de soporte.
          </li>
          <li>
            <strong>De uso:</strong> compras, órdenes, pagos registrados, consumos de los productos
            y un registro de cambios (auditoría) con quién hizo cada cambio y cuándo.
          </li>
          <li>
            <strong>Técnicos:</strong> la dirección IP y el navegador de cada sesión iniciada, para
            la seguridad de la cuenta.
          </li>
        </Lista>
        <p>
          No guardamos datos de tarjetas: los pagos en línea los procesa Mercado Pago con sus
          propias políticas.
        </p>
      </Apartado>

      <Apartado id="finalidad" numero={n("finalidad")} titulo="Para qué los usamos">
        <Lista>
          <li>
            prestar el servicio: dar acceso, administrar la licencia y habilitar los productos;
          </li>
          <li>facturar y gestionar los cobros;</li>
          <li>
            enviar avisos del servicio (códigos de verificación, vencimientos, saldos, órdenes) y,
            si lo aceptaste al registrarte, novedades;
          </li>
          <li>atender los pedidos de soporte;</li>
          <li>proteger las cuentas, prevenir fraudes y cumplir obligaciones legales.</li>
        </Lista>
        <p>No vendemos ni cedemos tus datos para publicidad de terceros.</p>
      </Apartado>

      <Apartado id="terceros" numero={n("terceros")} titulo="Con quién los compartimos">
        <p>Solo con quienes nos ayudan a prestar el servicio, y para eso:</p>
        <Lista>
          <li>alojamiento de la aplicación y de la base de datos (Vercel y Neon);</li>
          <li>envío de mails (Resend);</li>
          <li>cobros en línea (Mercado Pago) y facturación electrónica (Xubio);</li>
          <li>
            los productos de {RESPONSABLE.marca} que tu empresa usa (Prodigal, CotiWeb, BienSeguro),
            que consultan la licencia para habilitar lo contratado.
          </li>
        </Lista>
        <p>
          Algunos de estos proveedores alojan datos fuera de la Argentina, con niveles de protección
          adecuados. También podemos informar datos cuando lo exija una autoridad competente.
        </p>
      </Apartado>

      <Apartado id="conservacion" numero={n("conservacion")} titulo="Cuánto tiempo los guardamos">
        <p>
          Mientras la cuenta esté activa y, después, el tiempo que exijan las obligaciones legales
          (por ejemplo, las fiscales sobre la facturación). El registro de cambios se conserva como
          respaldo de lo actuado.
        </p>
      </Apartado>

      <Apartado id="seguridad" numero={n("seguridad")} titulo="Seguridad">
        <p>
          Las conexiones viajan cifradas, las contraseñas se guardan con un algoritmo de un solo
          sentido, los secretos de las integraciones se cifran y cada empresa solo ve sus propios
          datos. Ofrecemos verificación en dos pasos y registramos los cambios sensibles.
        </p>
      </Apartado>

      <Apartado id="cookies" numero={n("cookies")} titulo="Cookies y almacenamiento local">
        <p>Usamos solo lo necesario para que el portal funcione:</p>
        <Lista>
          <li>una cookie de sesión, para mantenerte conectado;</li>
          <li>una cookie que recuerda si la barra lateral está abierta o cerrada;</li>
          <li>el almacenamiento del navegador, para recordar el tema claro u oscuro.</li>
        </Lista>
        <p>No usamos cookies de publicidad ni de seguimiento de terceros.</p>
      </Apartado>

      <Apartado id="derechos" numero={n("derechos")} titulo="Tus derechos">
        <p>
          Podés pedir acceso a tus datos, y que se rectifiquen, actualicen o supriman cuando
          corresponda, escribiéndonos por los canales del apartado 1. Muchos datos se corrigen
          directamente desde el portal (Mi empresa, Usuarios, Seguridad de la cuenta).
        </p>
        <p className="rounded-xl border bg-muted/40 p-4 text-sm">
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
          mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
          interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
          N° 25.326. La Agencia de Acceso a la Información Pública, en su carácter de Órgano de
          Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que
          interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas
          vigentes en materia de protección de datos personales.
        </p>
      </Apartado>

      <Apartado id="cambios" numero={n("cambios")} titulo="Cambios en esta política">
        <p>
          Si la cambiamos, actualizamos la fecha de esta página y, si el cambio es importante, lo
          avisamos por mail o en el portal.
        </p>
      </Apartado>
    </DocumentoLegal>
  );
}
