"use client";

import { Building2, Contact, MapPin, Receipt } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  BotonEnviar,
  Campo,
  Casilla,
  FormularioConservado,
  MensajeFormulario,
  Selector,
} from "@/components/formulario";
import { buttonVariants } from "@/components/ui/button";
import { CONDICIONES_IVA_ETIQUETA, TIPOS_SOCIEDAD } from "@/lib/argentina";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { CamposDomicilio, Seccion } from "../[id]/editar/formulario";
import { altaClienteAccion } from "./acciones";

export function FormularioAltaCliente() {
  const [estado, accion] = useActionState(altaClienteAccion, ESTADO_INICIAL);
  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      <MensajeFormulario estado={estado} />

      <Seccion icono={Receipt} titulo="Datos fiscales">
        <Selector
          nombre="tipoPersona"
          etiqueta="Tipo de persona"
          estado={estado}
          valorInicial="JURIDICA"
        >
          <option value="JURIDICA">Persona jurídica</option>
          <option value="FISICA">Persona humana</option>
        </Selector>
        <Selector nombre="tipoSociedad" etiqueta="Tipo de sociedad" estado={estado} valorInicial="">
          <option value="">—</option>
          {TIPOS_SOCIEDAD.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Selector>
        <Campo nombre="nombre" etiqueta="Nombre o razón social" estado={estado} />
        <Campo nombre="cuit" etiqueta="CUIT / CUIL" placeholder="30-12345678-9" estado={estado} />
        <Selector
          nombre="condicionIva"
          etiqueta="Condición frente al IVA"
          estado={estado}
          valorInicial="RESPONSABLE_INSCRIPTO"
        >
          {Object.entries(CONDICIONES_IVA_ETIQUETA).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </Selector>
      </Seccion>

      <Seccion icono={MapPin} titulo="Domicilio fiscal">
        <CamposDomicilio prefijo="domicilioFiscal" valor={null} estado={estado} />
      </Seccion>

      <Seccion
        icono={Contact}
        titulo="Administrador"
        descripcion="Administra la cuenta en el portal: recibe los avisos y puede sumar usuarios."
      >
        <Campo nombre="administrador.nombre" etiqueta="Nombre y apellido" estado={estado} />
        <Campo nombre="administrador.email" etiqueta="Mail" type="email" estado={estado} />
        <Campo nombre="administrador.telefono" etiqueta="Teléfono" type="tel" estado={estado} />
        <div className="sm:col-span-2">
          <Casilla
            nombre="invitar"
            etiqueta="Enviarle el acceso por mail ahora"
            descripcion="Si no, puede entrar más tarde con ¿Olvidaste tu contraseña?"
            marcada={true}
          />
        </div>
      </Seccion>

      <Seccion
        icono={Building2}
        titulo="Empresa"
        descripcion="La instalación que se licencia. Si no le ponés nombre, lleva el del cliente."
      >
        <Campo nombre="empresa.nombre" etiqueta="Nombre (opcional)" estado={estado} />
        <Campo
          nombre="empresa.nombreCorto"
          etiqueta="Nombre corto (opcional)"
          maxLength={20}
          estado={estado}
        />
        <Selector
          nombre="empresa.tipoCliente"
          etiqueta="Tipo de cliente"
          estado={estado}
          valorInicial="DIRECTO"
        >
          <option value="DIRECTO">Directo</option>
          <option value="CORPORATIVO">Corporativo</option>
        </Selector>
        <Selector
          nombre="empresa.tipoInstalacion"
          etiqueta="Instalación"
          estado={estado}
          valorInicial="SAAS"
        >
          <option value="SAAS">SaaS (en la nube)</option>
          <option value="ON_PREMISE">On-premise</option>
        </Selector>
      </Seccion>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/admin/clientes" className={buttonVariants({ variant: "ghost" })}>
          Cancelar
        </Link>
        <BotonEnviar size="lg">Crear cliente</BotonEnviar>
      </div>
    </FormularioConservado>
  );
}
