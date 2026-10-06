import type { Metadata } from "next";
import Link from "next/link";
import { Apartado, DocumentoLegal, Lista } from "@/components/legal";
import { RESPONSABLE } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Condiciones de uso del portal STLic de SOFTeam Sistemas.",
};

const APARTADOS = [
  { id: "servicio", titulo: "El servicio" },
  { id: "cuenta", titulo: "Cuenta y acceso" },
  { id: "paquetes", titulo: "Paquetes, precios y pagos" },
  { id: "renovacion", titulo: "Vencimiento y renovación" },
  { id: "soporte", titulo: "Soporte" },
  { id: "datos", titulo: "Datos que carga tu empresa" },
  { id: "uso", titulo: "Uso aceptable" },
  { id: "disponibilidad", titulo: "Disponibilidad y responsabilidad" },
  { id: "cambios", titulo: "Cambios en estas condiciones" },
  { id: "ley", titulo: "Ley aplicable y contacto" },
];

export default function Terminos() {
  const n = (id: string) => APARTADOS.findIndex((a) => a.id === id) + 1;
  return (
    <DocumentoLegal
      titulo="Términos y condiciones"
      resumen={`Estas condiciones rigen el uso de STLic, el portal de ${RESPONSABLE.marca} (${RESPONSABLE.razonSocial}) para contratar, renovar y administrar las licencias de sus productos. Al crear una cuenta o usar el portal, tu empresa las acepta.`}
      apartados={APARTADOS}
    >
      <Apartado id="servicio" numero={n("servicio")} titulo="El servicio">
        <p>
          STLic permite a brokers, productores y organizaciones de seguros contratar y renovar
          paquetes de los productos de {RESPONSABLE.marca} (Prodigal, CotiWeb, BienSeguro y Boletín
          C@), administrar usuarios, oficinas y productores, seguir los consumos y pedir soporte. La
          licencia de cada empresa es la suma de los paquetes que tiene vigentes.
        </p>
      </Apartado>

      <Apartado id="cuenta" numero={n("cuenta")} titulo="Cuenta y acceso">
        <Lista>
          <li>
            Los datos de alta (razón social, CUIT, condición frente al IVA, domicilio fiscal y
            contactos) tienen que ser verdaderos y mantenerse al día: con ellos se factura.
          </li>
          <li>
            Cada persona ingresa con su propio usuario. Las credenciales son personales; tu empresa
            es responsable de lo que se haga con los usuarios que crea y de dar de baja a quien deje
            de necesitar acceso.
          </li>
          <li>
            Recomendamos activar la verificación en dos pasos. Si sospechás un acceso indebido,
            cambiá la contraseña y avisanos por soporte.
          </li>
        </Lista>
      </Apartado>

      <Apartado id="paquetes" numero={n("paquetes")} titulo="Paquetes, precios y pagos">
        <Lista>
          <li>
            Los precios del catálogo están en pesos argentinos y no incluyen IVA, que se suma en la
            orden según tu condición fiscal. Un precio puede cambiar para las contrataciones nuevas;
            los paquetes ya contratados conservan el suyo hasta su vencimiento.
          </li>
          <li>
            Cada compra genera una orden con el medio de pago elegido. El paquete se habilita al
            registrarse el pago, salvo que {RESPONSABLE.marca} acuerde otra condición con tu
            empresa.
          </li>
          <li>
            Los pagos en línea los procesa Mercado Pago: STLic no recibe ni guarda los datos de tu
            tarjeta. Las facturas se emiten electrónicamente y quedan disponibles en el portal.
          </li>
        </Lista>
      </Apartado>

      <Apartado id="renovacion" numero={n("renovacion")} titulo="Vencimiento y renovación">
        <Lista>
          <li>
            Los paquetes mensuales y anuales vencen en la fecha indicada en el portal. Los créditos
            sin vencimiento se usan hasta agotarse.
          </li>
          <li>
            Si un paquete tiene la renovación automática activa, antes del vencimiento se genera la
            orden de renovación para que haya tiempo de pagarla. Podés desactivarla desde el inicio
            del portal hasta que esa orden se genere; después, se puede cancelar la orden.
          </li>
          <li>
            Te avisamos por mail y en el portal cuando un paquete sin renovación automática está por
            vencer o un saldo está por agotarse. Un paquete vencido deja de estar disponible y se
            vuelve a contratar.
          </li>
        </Lista>
      </Apartado>

      <Apartado id="soporte" numero={n("soporte")} titulo="Soporte">
        <p>
          Los pedidos de soporte se hacen desde el portal y cada pedido nuevo usa un ticket de
          soporte de tu licencia. El cupo mensual se renueva el día 1; también se pueden sumar
          tickets con un paquete de soporte. Las respuestas se dan por el mismo pedido.
        </p>
      </Apartado>

      <Apartado id="datos" numero={n("datos")} titulo="Datos que carga tu empresa">
        <p>
          Tu empresa conserva la titularidad de los datos que carga (usuarios, productores,
          oficinas, adjuntos de soporte) y es responsable de contar con la autorización de las
          personas a las que pertenecen. {RESPONSABLE.marca} los trata solo para prestar el
          servicio, como se explica en la{" "}
          <Link href="/privacidad" className="text-primary underline-offset-4 hover:underline">
            política de privacidad
          </Link>
          .
        </p>
      </Apartado>

      <Apartado id="uso" numero={n("uso")} titulo="Uso aceptable">
        <p>No está permitido:</p>
        <Lista>
          <li>usar el portal para fines ilícitos o cargar datos de terceros sin autorización;</li>
          <li>
            intentar acceder a información de otras empresas, eludir los controles de seguridad o de
            licencia, o afectar el funcionamiento del servicio;
          </li>
          <li>revender o ceder el acceso sin acuerdo de {RESPONSABLE.marca}.</li>
        </Lista>
        <p>
          Ante un uso indebido, {RESPONSABLE.marca} puede suspender el acceso, avisando a la empresa
          salvo que la urgencia no lo permita.
        </p>
      </Apartado>

      <Apartado
        id="disponibilidad"
        numero={n("disponibilidad")}
        titulo="Disponibilidad y responsabilidad"
      >
        <p>
          Trabajamos para que el portal esté disponible todo el tiempo, pero puede haber
          interrupciones por mantenimiento o por causas ajenas. Los cambios importantes quedan
          registrados en una auditoría. {RESPONSABLE.marca} no responde por daños indirectos ni por
          el uso que cada empresa haga de la información, en la medida que lo permita la ley.
        </p>
      </Apartado>

      <Apartado id="cambios" numero={n("cambios")} titulo="Cambios en estas condiciones">
        <p>
          Si cambiamos estas condiciones, actualizamos la fecha de esta página y, si el cambio es
          importante, lo avisamos por mail o en el portal. Seguir usando el servicio después del
          aviso implica aceptarlas.
        </p>
      </Apartado>

      <Apartado id="ley" numero={n("ley")} titulo="Ley aplicable y contacto">
        <p>
          Estas condiciones se rigen por las leyes de la República Argentina. Para consultas,
          escribinos desde el soporte del portal o a través de{" "}
          <a href={RESPONSABLE.sitio} className="text-primary underline-offset-4 hover:underline">
            {RESPONSABLE.sitioTexto}
          </a>
          .
        </p>
      </Apartado>
    </DocumentoLegal>
  );
}
