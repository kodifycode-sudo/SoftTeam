import { eq, inArray } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

/** Qué cambió, dicho como lo reconoce una persona, y dónde verlo. */
export interface Referencia {
  texto: string;
  href?: string;
}

export interface ReferenciasRegistro {
  /** El registro afectado ("Orden #10033", "Allianz"). */
  objeto?: Referencia;
  /** La empresa a la que pertenece, si corresponde. */
  empresa?: Referencia;
}

interface RegistroAuditado {
  id: number;
  entidad: string;
  entidadId: string;
  empresaId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids de una entidad que son UUID (las tablas con id uuid no aceptan otra cosa). */
function idsDe(registros: RegistroAuditado[], entidades: string[]): string[] {
  return [
    ...new Set(
      registros
        .filter((r) => entidades.includes(r.entidad) && UUID.test(r.entidadId))
        .map((r) => r.entidadId),
    ),
  ];
}

/** Las entidades cuyo id es el de la empresa (configuración de la empresa). */
const DE_EMPRESA = ["empresa", "marca", "politicas", "notas"];

/**
 * Nombres y enlaces de los registros de auditoría, resueltos en pocas
 * consultas (una por tipo). Lo que ya no existe queda sin referencia y la
 * pantalla muestra el nombre guardado en el cambio o el id.
 */
export async function referenciasAuditoria(
  db: Ejecutor,
  registros: RegistroAuditado[],
): Promise<Map<number, ReferenciasRegistro>> {
  const empresaIds = [
    ...new Set([
      ...registros.map((r) => r.empresaId).filter((id): id is string => !!id),
      ...idsDe(registros, DE_EMPRESA),
      ...registros
        .filter((r) => r.entidad === "empresa_aseguradora")
        .map((r) => r.entidadId.split(":")[0] ?? "")
        .filter((id) => UUID.test(id)),
    ]),
  ];
  const abreviaturas = [
    ...new Set(
      registros
        .filter((r) => r.entidad === "empresa_aseguradora")
        .map((r) => r.entidadId.split(":")[1] ?? "")
        .filter(Boolean),
    ),
  ];
  const usuarioIds = [
    ...new Set(
      registros
        .filter((r) => r.entidad === "usuario_softeam" || r.entidad === "usuario")
        .map((r) => r.entidadId),
    ),
  ];
  const vacio = Promise.resolve([]);
  const consultar = <T>(ids: unknown[], consulta: () => Promise<T[]>) =>
    ids.length ? consulta() : (vacio as Promise<T[]>);

  const clienteIds = idsDe(registros, ["cliente"]);
  const ordenIds = idsDe(registros, ["orden"]);
  const contratoIds = idsDe(registros, ["contrato"]);
  const incidenteIds = idsDe(registros, ["incidente"]);
  const paqueteIds = idsDe(registros, ["paquete"]);
  const grupoIds = idsDe(registros, ["grupo"]);
  const productorIds = idsDe(registros, ["productor"]);
  const oficinaIds = idsDe(registros, ["oficina"]);
  const canalIds = idsDe(registros, ["canal"]);
  const colaboradorIds = idsDe(registros, ["colaborador"]);
  const aseguradoraIds = idsDe(registros, ["aseguradora"]);
  const ticketIds = idsDe(registros, ["ticket"]);
  const tipoIds = idsDe(registros, ["tipo_comunicacion"]);

  const [
    empresas,
    clientes,
    ordenes,
    contratos,
    incidentes,
    paquetes,
    grupos,
    productores,
    oficinas,
    canales,
    colaboradores,
    aseguradoras,
    aseguradorasPorAbreviatura,
    tickets,
    tipos,
    usuarios,
  ] = await Promise.all([
    consultar(empresaIds, () =>
      db
        .select({ id: t.empresas.id, nombre: t.empresas.nombre, clienteId: t.empresas.clienteId })
        .from(t.empresas)
        .where(inArray(t.empresas.id, empresaIds)),
    ),
    consultar(clienteIds, () =>
      db
        .select({ id: t.clientes.id, nombre: t.clientes.nombre })
        .from(t.clientes)
        .where(inArray(t.clientes.id, clienteIds)),
    ),
    consultar(ordenIds, () =>
      db
        .select({ id: t.ordenes.id, numero: t.ordenes.numero })
        .from(t.ordenes)
        .where(inArray(t.ordenes.id, ordenIds)),
    ),
    consultar(contratoIds, () =>
      db
        .select({ id: t.contratos.id, paquete: t.paquetes.nombre })
        .from(t.contratos)
        .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
        .where(inArray(t.contratos.id, contratoIds)),
    ),
    consultar(incidenteIds, () =>
      db
        .select({ id: t.incidentes.id, numero: t.incidentes.numero, asunto: t.incidentes.asunto })
        .from(t.incidentes)
        .where(inArray(t.incidentes.id, incidenteIds)),
    ),
    consultar(paqueteIds, () =>
      db
        .select({ id: t.paquetes.id, nombre: t.paquetes.nombre })
        .from(t.paquetes)
        .where(inArray(t.paquetes.id, paqueteIds)),
    ),
    consultar(grupoIds, () =>
      db
        .select({ id: t.gruposEconomicos.id, nombre: t.gruposEconomicos.nombre })
        .from(t.gruposEconomicos)
        .where(inArray(t.gruposEconomicos.id, grupoIds)),
    ),
    consultar(productorIds, () =>
      db
        .select({ id: t.productores.id, nombre: t.productores.nombre })
        .from(t.productores)
        .where(inArray(t.productores.id, productorIds)),
    ),
    consultar(oficinaIds, () =>
      db
        .select({ id: t.oficinas.id, nombre: t.oficinas.nombre })
        .from(t.oficinas)
        .where(inArray(t.oficinas.id, oficinaIds)),
    ),
    consultar(canalIds, () =>
      db
        .select({ id: t.canales.id, nombre: t.canales.nombre })
        .from(t.canales)
        .where(inArray(t.canales.id, canalIds)),
    ),
    consultar(colaboradorIds, () =>
      db
        .select({ id: t.colaboradores.id, nombre: t.colaboradores.nombre })
        .from(t.colaboradores)
        .where(inArray(t.colaboradores.id, colaboradorIds)),
    ),
    consultar(aseguradoraIds, () =>
      db
        .select({ id: t.aseguradoras.id, nombre: t.aseguradoras.nombre })
        .from(t.aseguradoras)
        .where(inArray(t.aseguradoras.id, aseguradoraIds)),
    ),
    consultar(abreviaturas, () =>
      db
        .select({ abreviatura: t.aseguradoras.abreviatura, nombre: t.aseguradoras.nombre })
        .from(t.aseguradoras)
        .where(inArray(t.aseguradoras.abreviatura, abreviaturas)),
    ),
    consultar(ticketIds, () =>
      db
        .select({ id: t.tickets.id, codigo: t.tickets.codigo })
        .from(t.tickets)
        .where(inArray(t.tickets.id, ticketIds)),
    ),
    consultar(tipoIds, () =>
      db
        .select({ id: t.tiposComunicacion.id, nombre: t.tiposComunicacion.nombre })
        .from(t.tiposComunicacion)
        .where(inArray(t.tiposComunicacion.id, tipoIds)),
    ),
    consultar(usuarioIds, () =>
      db
        .select({ id: t.usuarios.id, nombre: t.usuarios.name })
        .from(t.usuarios)
        .where(inArray(t.usuarios.id, usuarioIds)),
    ),
  ]);

  const porId = <F extends { id: string }>(filas: F[]) => new Map(filas.map((f) => [f.id, f]));
  const mEmpresas = porId(empresas);
  const nombre = (filas: { id: string; nombre: string }[]) =>
    new Map(filas.map((f) => [f.id, f.nombre]));
  const mClientes = nombre(clientes);
  const mOrdenes = porId(ordenes);
  const mContratos = porId(contratos);
  const mIncidentes = porId(incidentes);
  const mPaquetes = nombre(paquetes);
  const mGrupos = nombre(grupos);
  const mProductores = nombre(productores);
  const mOficinas = nombre(oficinas);
  const mCanales = nombre(canales);
  const mColaboradores = nombre(colaboradores);
  const mAseguradoras = nombre(aseguradoras);
  const mAbreviaturas = new Map(aseguradorasPorAbreviatura.map((a) => [a.abreviatura, a.nombre]));
  const mTickets = porId(tickets);
  const mTipos = nombre(tipos);
  const mUsuarios = nombre(usuarios);

  const refEmpresa = (id: string | null | undefined): Referencia | undefined => {
    const e = id ? mEmpresas.get(id) : undefined;
    return e ? { texto: e.nombre, href: `/admin/clientes/${e.clienteId}` } : undefined;
  };
  const texto = (valor: string | undefined, href?: string): Referencia | undefined =>
    valor ? (href ? { texto: valor, href } : { texto: valor }) : undefined;

  const resultado = new Map<number, ReferenciasRegistro>();
  for (const r of registros) {
    const id = r.entidadId;
    let objeto: Referencia | undefined;
    let empresaId = r.empresaId;
    switch (r.entidad) {
      case "cliente":
        objeto = texto(mClientes.get(id), `/admin/clientes/${id}`);
        break;
      case "empresa":
      case "marca":
      case "politicas":
      case "notas":
        // El registro es la propia empresa: va como objeto, no repetido como contexto.
        objeto = refEmpresa(id);
        empresaId = null;
        break;
      case "orden": {
        const o = mOrdenes.get(id);
        objeto = o && { texto: `Orden #${o.numero}`, href: `/admin/ordenes/${id}` };
        break;
      }
      case "contrato":
        objeto = texto(mContratos.get(id)?.paquete, `/admin/contratos/${id}`);
        break;
      case "incidente": {
        const i = mIncidentes.get(id);
        objeto = i && { texto: `Pedido #${i.numero} · ${i.asunto}`, href: `/admin/soporte/${id}` };
        break;
      }
      case "paquete":
        objeto = texto(mPaquetes.get(id), `/admin/paquetes/${id}`);
        break;
      case "grupo":
        objeto = texto(mGrupos.get(id), `/admin/grupos/${id}`);
        break;
      case "empresa_aseguradora": {
        const [empresa, abreviatura = ""] = id.split(":");
        objeto = texto(mAbreviaturas.get(abreviatura) ?? abreviatura);
        empresaId = empresaId ?? empresa ?? null;
        break;
      }
      case "aseguradora":
        objeto = texto(mAseguradoras.get(id));
        break;
      case "productor":
        objeto = texto(mProductores.get(id));
        break;
      case "oficina":
        objeto = texto(mOficinas.get(id));
        break;
      case "canal":
        objeto = texto(mCanales.get(id));
        break;
      case "colaborador":
        objeto = texto(mColaboradores.get(id));
        break;
      case "ticket":
        objeto = texto(mTickets.get(id)?.codigo);
        break;
      case "tipo_comunicacion":
        objeto = texto(mTipos.get(id));
        break;
      case "usuario":
      case "usuario_softeam":
        objeto = texto(mUsuarios.get(id));
        break;
      case "parametro":
      case "moneda":
      case "importacion":
        // El id ya es legible ("cobranza.semaforo_dias", "ARS", "clientes").
        objeto = { texto: id };
        break;
    }
    resultado.set(r.id, {
      ...(objeto ? { objeto } : {}),
      ...(refEmpresa(empresaId) ? { empresa: refEmpresa(empresaId) } : {}),
    });
  }
  return resultado;
}
