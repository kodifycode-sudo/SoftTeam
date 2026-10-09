import type { Centavos } from "@/domain/dinero";
import type { Comprobante, Facturador, SolicitudFactura } from "./facturador";

/*
 * Adaptador de Xubio (API 1.1, https://xubio.com/API/documentation). Emite
 * las facturas de venta con CAE. Armado sobre el contrato público de la API
 * (swagger 1.1); falta probarlo contra una cuenta real.
 *
 * Qué hace, por orden:
 * 1. Token OAuth2 (client_credentials), guardado hasta que vence.
 * 2. Cliente: el código de Xubio que cargó SOFTeam; si no, lo busca por
 *    CUIT; si no existe, lo crea.
 * 3. Idempotencia: cada factura lleva `externalId = stlic-<orden>`; antes de
 *    emitir busca si ya existe (un reintento tras una caída no duplica).
 * 4. Emite la factura y, si Xubio no le asignó el CAE, lo pide.
 */

const API = "https://xubio.com/API/1.1";

export interface ConfigXubio {
  clientId: string;
  secretId: string;
  /** Punto de venta electrónico con el que se factura (id de Xubio). */
  puntoVentaId: number;
  /** Producto/servicio de Xubio de las líneas ("Licencias STLic", IVA 21 %). */
  productoId: number;
  /** Centro de costo, si la cuenta los usa. */
  centroDeCostoId?: number | undefined;
}

/** Condición del receptor según ARCA → categoría fiscal de Xubio. */
const CATEGORIA_FISCAL: Record<number, string> = { 1: "RI", 4: "EX", 5: "CF", 6: "MT" };

const pesos = (c: Centavos) => Number(c) / 100;

/** Separa el neto y el IVA de un total con IVA incluido (alícuota en centésimos). */
export function desglosarIva(total: Centavos, alicuota: bigint) {
  const neto = (total * 10000n + (10000n + alicuota) / 2n) / (10000n + alicuota);
  return { neto, iva: total - neto };
}

/** Días antes de hoy en que se busca una factura ya emitida para la orden. */
const DIAS_BUSQUEDA = 7;

type Json = Record<string, unknown>;

export function crearXubio(config: ConfigXubio, fetchApi: typeof fetch = fetch): Facturador {
  let token: { valor: string; vence: number } | undefined;

  async function obtenerToken(): Promise<string> {
    if (token && token.vence > Date.now() + 60_000) return token.valor;
    const respuesta = await fetchApi(`${API}/TokenEndpoint`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secretId}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) throw new Error(`Xubio rechazó las credenciales (${respuesta.status})`);
    const datos = (await respuesta.json()) as { access_token?: string; expires_in?: string };
    if (!datos.access_token) throw new Error("Xubio no devolvió el token");
    token = {
      valor: datos.access_token,
      vence: Date.now() + Number(datos.expires_in ?? 3600) * 1000,
    };
    return token.valor;
  }

  async function pedir<T = Json>(ruta: string, init: RequestInit = {}): Promise<T> {
    const respuesta = await fetchApi(`${API}${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await obtenerToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (respuesta.status === 401) token = undefined;
    if (!respuesta.ok) {
      throw new Error(`Xubio respondió ${respuesta.status} en ${ruta}: ${await respuesta.text()}`);
    }
    return (await respuesta.json()) as T;
  }

  async function clienteDeXubio(s: SolicitudFactura): Promise<number> {
    if (s.cliente.xubioId && /^\d+$/.test(s.cliente.xubioId)) return Number(s.cliente.xubioId);
    const encontrados = await pedir<Json[]>(
      `/clienteBean?numeroIdentificacion=${encodeURIComponent(s.cliente.cuit)}`,
    );
    const existente = encontrados.find((c) => typeof c.cliente_id === "number");
    if (existente) return existente.cliente_id as number;
    const creado = await pedir<Json>("/clienteBean", {
      method: "POST",
      body: JSON.stringify({
        nombre: s.cliente.nombre,
        razonSocial: s.cliente.nombre,
        CUIT: s.cliente.cuit,
        identificacionTributaria: { codigo: "CUIT" },
        categoriaFiscal: { codigo: CATEGORIA_FISCAL[s.cliente.codigoArca] ?? "CF" },
        email: s.cliente.email ?? undefined,
        esclienteextranjero: 0,
        esProveedor: 0,
      }),
    });
    if (typeof creado.cliente_id !== "number") throw new Error("Xubio no devolvió el cliente");
    return creado.cliente_id;
  }

  function aComprobante(s: SolicitudFactura, factura: Json): Comprobante {
    const id = factura.transaccionid ?? factura.transaccionId;
    const numero = String(factura.numeroDocumento ?? "");
    if (id === undefined || !numero) throw new Error("Xubio no devolvió el número de factura");
    return {
      comprobanteId: String(id),
      numero: /^[ABC][\s-]/.test(numero) ? numero : `${s.tipoComprobante} ${numero}`,
    };
  }

  async function yaEmitida(s: SolicitudFactura, externalId: string) {
    const hasta = s.fecha;
    const desde = new Date(`${s.fecha}T12:00:00Z`);
    desde.setUTCDate(desde.getUTCDate() - DIAS_BUSQUEDA);
    const facturas = await pedir<Json[]>(
      `/comprobanteVentaBean?fechaDesde=${desde.toISOString().slice(0, 10)}&fechaHasta=${hasta}`,
    );
    return facturas.find((f) => f.externalId === externalId);
  }

  return {
    nombre: "xubio",

    async emitir(s) {
      const externalId = `stlic-${s.ordenId}`;
      const previa = await yaEmitida(s, externalId);
      if (previa?.numeroDocumento) return aComprobante(s, previa);

      const cliente = await clienteDeXubio(s);
      const centroDeCosto = config.centroDeCostoId ? { ID: config.centroDeCostoId } : null;
      const items = s.lineas.map((l) => {
        const { neto, iva } = desglosarIva(l.total, s.alicuotaIva);
        return {
          producto: { ID: config.productoId },
          centroDeCosto,
          descripcion: l.descripcion.slice(0, 200),
          cantidad: 1,
          // Xubio pide el precio con IVA incluido.
          precio: pesos(l.total),
          importe: pesos(neto),
          iva: pesos(iva),
          total: pesos(l.total),
          montoExento: 0,
          porcentajeDescuento: 0,
        };
      });
      const factura = await pedir<Json>("/comprobanteVentaBean", {
        method: "POST",
        body: JSON.stringify({
          externalId,
          tipo: 1, // Factura
          cliente: { cliente_id: cliente, ID: cliente },
          puntoVenta: { ID: config.puntoVentaId },
          fecha: s.fecha,
          fechaVto: s.fecha,
          condicionDePago: 2, // Al contado: se factura lo ya cobrado.
          cotizacion: 1,
          descripcion: s.observacion ?? `Orden STLic #${s.numeroOrden}`,
          transaccionProductoItems: items,
          transaccionPercepcionItems: [],
          transaccionCobranzaItems: [],
          importeGravado: pesos(s.netoGravado),
          importeImpuestos: pesos(s.iva),
          importetotal: pesos(s.total),
        }),
      });
      if (!factura.CAE && factura.transaccionid !== undefined) {
        await pedir("/solicitarCAE", {
          method: "POST",
          body: JSON.stringify({ transaccionId: factura.transaccionid, externalId }),
        });
      }
      return aComprobante(s, factura);
    },
  };
}
