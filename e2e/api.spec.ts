import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { cabecerasFirmadas, verificarFirma } from "../src/server/seguridad/firma";
import { ADMIN, expect, ingresar, registrarCliente, test } from "./utilidades";

const BASE = process.env.STLIC_URL ?? "http://localhost:3000";
const sufijo = Date.now().toString(36);
const sistema = `prueba-${sufijo}`;
const email = `api.${sufijo}@brokerdelsur.com.ar`;

interface Aviso {
  ruta: string;
  cabeceras: IncomingMessage["headers"];
  cuerpo: string;
}

let receptor: Server;
let urlReceptor = "";
const avisos: Aviso[] = [];
let secreto = "";
let numeroEmpresa = 0;

/** Llamada firmada a la API, como la haría un producto. */
async function llamar(metodo: "GET" | "POST", ruta: string, cuerpo = "", clave = secreto) {
  const headers = cabecerasFirmadas(sistema, clave, { metodo, ruta, cuerpo });
  return fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { ...headers, ...(cuerpo ? { "content-type": "application/json" } : {}) },
    body: cuerpo || undefined,
  });
}

test.beforeAll(async () => {
  // Receptor de webhooks local: guarda lo que recibe.
  receptor = createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (parte) => {
      cuerpo += parte;
    });
    req.on("end", () => {
      avisos.push({ ruta: req.url ?? "", cabeceras: req.headers, cuerpo });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((listo) => receptor.listen(0, "127.0.0.1", listo));
  urlReceptor = `http://127.0.0.1:${(receptor.address() as AddressInfo).port}/avisos`;
});

test.afterAll(() => {
  receptor.close();
});

test.describe
  .serial("API para productos", () => {
    test("SOFTeam da de alta el sistema y ve el secreto una sola vez", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/integraciones");
      await page.getByRole("button", { name: "Nuevo sistema" }).click();
      await page.getByLabel("Identificador").fill(sistema);
      await page.getByLabel("Nombre", { exact: true }).fill("Sistema de prueba");
      await page.getByLabel("Webhook (opcional)").fill(urlReceptor);
      await page.getByRole("button", { name: "Crear y generar secreto" }).click();
      await expect(page.getByText("Guardalo ahora: no se vuelve a mostrar")).toBeVisible();
      secreto = (await page.getByRole("dialog").locator("code").textContent()) ?? "";
      expect(secreto).toMatch(/^[A-Za-z0-9_-]{43}$/);
      await page.getByRole("button", { name: "Listo, lo guardé" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.getByRole("main").getByText(sistema)).toBeVisible();
      // Al reabrir, el formulario está vacío: el secreto no reaparece.
      await page.getByRole("button", { name: "Nuevo sistema" }).click();
      await expect(page.getByLabel("Identificador")).toHaveValue("");
      await expect(page.getByText("Guardalo ahora")).toHaveCount(0);
      await page.keyboard.press("Escape");
    });

    test("un cliente nuevo aparece en la API", async ({ page }) => {
      await registrarCliente(page, `API ${sufijo} SRL`, email);
      const encabezado = await page
        .getByText(/Empresa #\d+/)
        .first()
        .textContent();
      numeroEmpresa = Number(encabezado?.match(/#(\d+)/)?.[1]);
      expect(numeroEmpresa).toBeGreaterThan(0);

      const respuesta = await llamar("GET", `/api/v1/empresas/${numeroEmpresa}`);
      expect(respuesta.status).toBe(200);
      const empresa = await respuesta.json();
      expect(empresa).toMatchObject({
        version: "EmpresaFull_V1",
        empresa: { numero: numeroEmpresa, activa: true },
        oficinas: [{ codigo: "01001" }],
      });

      const licencia = await (
        await llamar("GET", `/api/v1/empresas/${numeroEmpresa}/licencia`)
      ).json();
      expect(licencia).toMatchObject({ empresa: numeroEmpresa, productos: {} });
    });

    test("sin firma, con firma alterada o con otro secreto: 401", async () => {
      const ruta = `/api/v1/empresas/${numeroEmpresa}/licencia`;
      expect((await fetch(`${BASE}${ruta}`)).status).toBe(401);
      expect((await llamar("GET", ruta, "", "otro-secreto")).status).toBe(401);
      const headers = cabecerasFirmadas(sistema, secreto, { metodo: "GET", ruta, cuerpo: "" });
      const alterada = await fetch(`${BASE}/api/v1/empresas/1/licencia`, { headers });
      expect(alterada.status).toBe(401);
      expect(alterada.headers.get("content-type")).toContain("application/problem+json");
    });

    test("consumos: validación, sin saldo e idempotencia", async () => {
      const ruta = `/api/v1/empresas/${numeroEmpresa}/consumos`;
      const invalido = await llamar("POST", ruta, JSON.stringify({ familia: "fax", cantidad: 0 }));
      expect(invalido.status).toBe(422);

      const cuerpo = JSON.stringify({
        familia: "notificaciones",
        cantidad: 10,
        transaccion: `envio-${sufijo}`,
      });
      const primero = await llamar("POST", ruta, cuerpo);
      expect(primero.status).toBe(201);
      expect(await primero.json()).toMatchObject({
        solicitado: 10,
        consumido: 0,
        completo: false,
        repetido: false,
      });

      const repetido = await llamar("POST", ruta, cuerpo);
      expect(repetido.status).toBe(200);
      expect(await repetido.json()).toMatchObject({ repetido: true });
    });

    test("un cambio en la empresa llega como aviso firmado al webhook", async ({ page }) => {
      const antes = avisos.length;
      await ingresar(page, email, "Broker.Seguro2026");
      await page.goto("/portal/oficinas");
      await page.getByRole("button", { name: "Nueva oficina" }).click();
      await page.getByLabel("Nombre de la oficina").fill("Sucursal API");
      await page.getByRole("button", { name: "Crear oficina" }).click();
      await expect(page.getByText("Oficina 01-002 creada.")).toBeVisible();

      await expect.poll(() => avisos.length, { timeout: 15_000 }).toBeGreaterThan(antes);
      const aviso = avisos.find((a) => a.cuerpo.includes(`"empresa":${numeroEmpresa}`));
      expect(aviso).toBeDefined();
      const datos = JSON.parse(aviso!.cuerpo);
      expect(datos).toMatchObject({ tipo: "empresa.actualizada", empresa: numeroEmpresa });
      expect(
        verificarFirma(
          secreto,
          {
            metodo: "POST",
            ruta: aviso!.ruta,
            cuerpo: aviso!.cuerpo,
            timestamp: String(aviso!.cabeceras["x-stlic-timestamp"]),
          },
          String(aviso!.cabeceras["x-stlic-firma"]),
        ),
      ).toEqual({ ok: true });
    });

    test("SOFTeam desactiva el sistema y deja de poder usar la API", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/integraciones");
      const tarjeta = page.locator("[data-slot=card]").filter({ hasText: sistema });
      await tarjeta.getByRole("button", { name: "Desactivar" }).click();
      await expect(tarjeta.getByText("Inactivo")).toBeVisible();
      const respuesta = await llamar("GET", `/api/v1/empresas/${numeroEmpresa}/licencia`);
      expect(respuesta.status).toBe(401);
    });
  });
