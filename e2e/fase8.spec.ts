import { readFileSync } from "node:fs";
import {
  ADMIN,
  CONTRASENA,
  capturar,
  expect,
  ingresar,
  registrarCliente,
  test,
} from "./utilidades";

/** Imagen PNG válida de 1×1, como captura de pantalla. */
const CAPTURA = {
  name: "captura-error.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
};

const sufijo = Date.now().toString(36).toUpperCase();
const razonSocial = `Soporte ${sufijo} SRL`;
const email = `soporte.${sufijo.toLowerCase()}@brokerdelsur.com.ar`;
const asunto = `No puedo emitir ${sufijo}`;
let numeroOrden = "";
let urlPedido = "";

/** PNG de 1×1 válido. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.describe
  .serial("soporte, marca, notas y reportes", () => {
    test("sin tickets de soporte no se puede abrir un pedido; se compran", async ({ page }) => {
      await registrarCliente(page, razonSocial, email);
      await page.getByRole("link", { name: "Soporte", exact: true }).click();
      await expect(page.getByRole("button", { name: "Nuevo pedido" })).toBeDisabled();
      await expect(page.getByText("No te quedan tickets de soporte.")).toBeVisible();

      await page.goto("/portal/paquetes?tipo=CONSUMIBLE");
      await page
        .getByRole("button", { name: "Agregar Soporte 10 tickets · Pago único al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();
      await page.goto("/portal/carrito");
      await page.getByRole("checkbox", { name: /Revisé los paquetes/ }).click();
      await page.getByRole("button", { name: "Confirmar orden" }).click();
      await expect(page).toHaveURL(/\/portal\/ordenes\/[0-9a-f-]{36}\?nueva=1/);
      numeroOrden =
        (await page.getByRole("heading", { level: 1 }).textContent())?.replace(/\D/g, "") ?? "";
    });

    test("SOFTeam registra el pago", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/ordenes");
      await page
        .getByRole("link", { name: `#${numeroOrden}` })
        .first()
        .click();
      await page.getByRole("button", { name: "Registrar pago" }).click();
      await page.getByRole("button", { name: "Sí, registrar pago" }).click();
      await expect(page.getByText(/Pago registrado/)).toBeVisible();
    });

    test("el cliente abre un pedido y consume un ticket", async ({ page }) => {
      await ingresar(page, email, CONTRASENA);
      await page.goto("/portal/soporte");
      const disponibles = page.getByRole("region", { name: "Tickets de soporte disponibles" });
      await expect(disponibles.getByText("10", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Nuevo pedido" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Urgencia").selectOption("ALTA");
      await dialogo.getByLabel("Asunto").fill(asunto);
      await dialogo
        .getByLabel("¿Qué pasa?")
        .fill("Al emitir una póliza de La Segunda aparece un error de conexión.");
      // Un archivo que no es imagen ni PDF se rechaza, sin consumir el ticket.
      await dialogo.getByLabel("Adjuntos (opcional)").setInputFiles({
        name: "nota.html",
        mimeType: "image/png",
        buffer: Buffer.from("<script>alert(1)</script>"),
      });
      await dialogo.getByRole("button", { name: "Enviar a Soporte" }).click();
      await expect(
        dialogo.getByText('"nota.html" no es una imagen (PNG, JPG, WebP) ni un PDF.'),
      ).toBeVisible();
      await dialogo.getByLabel("Adjuntos (opcional)").setInputFiles(CAPTURA);
      await dialogo.getByRole("button", { name: "Enviar a Soporte" }).click();
      await expect(page.getByText(/Recibimos tu pedido #\d+/)).toBeVisible();
      urlPedido = new URL(page.url()).pathname;

      await page.goto("/portal/soporte");
      await expect(disponibles.getByText("9", { exact: true })).toBeVisible();
      await expect(page.getByText(asunto)).toBeVisible();
    });

    test("Soporte deja una nota interna y responde", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.getByRole("link", { name: "Soporte", exact: true }).click();
      const fila = page.getByRole("row").filter({ hasText: asunto });
      await expect(fila.getByText("Espera respuesta")).toBeVisible();
      await expect(fila.getByText("Alta")).toBeVisible();
      await fila.getByRole("link").click();

      await expect(page.getByRole("link", { name: /captura-error.png/ })).toBeVisible();
      await page.getByLabel("Tu respuesta").fill("Parece un corte del lado de la compañía.");
      await page.getByLabel("Adjuntos (opcional)").setInputFiles({
        name: "log-servidor.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 log interno"),
      });
      await page.getByRole("checkbox", { name: /Nota interna/ }).click();
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByText("Nota interna guardada.")).toBeVisible();

      await page.getByLabel("Tu respuesta").fill("Ya lo estamos revisando con la aseguradora.");
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByText("Respuesta enviada al cliente.")).toBeVisible();
      await expect(page.getByText("Nota interna (el cliente no la ve)").first()).toBeVisible();
      await capturar(page, "admin-soporte-pedido");
    });

    test("el cliente ve la respuesta (no la nota), contesta y cierra", async ({ page }) => {
      await ingresar(page, email, CONTRASENA);
      await expect(page.getByRole("link", { name: /^Avisos: \d+ sin leer$/ })).toBeVisible();
      await page.goto(urlPedido);
      await expect(page.getByText("Ya lo estamos revisando con la aseguradora.")).toBeVisible();
      await expect(page.getByText("Parece un corte del lado de la compañía.")).toHaveCount(0);
      // Ve su captura, pero no el adjunto de la nota interna.
      const captura = page.getByRole("link", { name: /captura-error.png/ });
      await expect(captura).toBeVisible();
      await expect(page.getByRole("link", { name: /log-servidor.pdf/ })).toHaveCount(0);
      const imagen = await page.request.get((await captura.getAttribute("href")) ?? "");
      expect(imagen.headers()["content-type"]).toBe("image/png");
      await page.getByLabel("Tu respuesta").fill("Gracias, quedo atento.");
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByText("Mensaje enviado.")).toBeVisible();
      await capturar(page, "portal-soporte-pedido");
      await page.getByRole("button", { name: "Cerrar pedido" }).click();
      await expect(page.getByText("Este pedido está cerrado.")).toBeVisible();
    });

    test("marca blanca: valida el logo y guarda colores y textos", async ({ page }) => {
      await ingresar(page, email, CONTRASENA);
      await page.getByRole("link", { name: "Marca", exact: true }).click();
      await page.getByLabel("Nombre comercial").fill(`Seguros ${sufijo}`);
      await page.getByLabel("Eslogan").fill("Te cuidamos siempre");
      await page.getByLabel("Color principal", { exact: true }).fill("#1d4ed8");
      const vista = page.getByRole("region", { name: "Vista previa" });
      await expect(vista.getByText(`Seguros ${sufijo}`)).toBeVisible();

      await page.getByLabel("Logo").setInputFiles({
        name: "logo.txt",
        mimeType: "image/png",
        buffer: Buffer.from("no es una imagen"),
      });
      await page.getByRole("button", { name: "Guardar marca" }).click();
      await expect(page.getByText("El logo tiene que ser PNG, JPG o WebP.")).toBeVisible();
      // Lo tipeado se conserva al corregir.
      await expect(page.getByLabel("Nombre comercial")).toHaveValue(`Seguros ${sufijo}`);

      await page
        .getByLabel("Logo")
        .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
      await page.getByRole("button", { name: "Guardar marca" }).click();
      await expect(page.getByText(/Marca guardada/)).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Nombre comercial")).toHaveValue(`Seguros ${sufijo}`);
      await expect(vista.getByRole("img", { name: "Logo" })).toHaveAttribute(
        "src",
        /\/portal\/marca\/logo\?v=/,
      );
      await capturar(page, "portal-marca");
    });

    test("SOFTeam deja notas: el cliente ve solo las públicas", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto(`/admin/clientes?q=${encodeURIComponent(razonSocial)}`);
      await page.getByRole("link", { name: razonSocial }).first().click();
      await page
        .getByLabel("Notas de SOFTeam")
        .fill("Atiende Ana en horario de oficina.\n* Pidió descuento, no corresponde.");
      await page.getByRole("button", { name: "Guardar notas" }).click();
      await expect(page.getByText("Notas guardadas.")).toBeVisible();
      await expect(page.getByText("Pedido de soporte").first()).toBeVisible();
      await capturar(page, "admin-cliente-notas");

      await ingresar(page, email, CONTRASENA);
      await page.goto("/portal/empresa");
      await expect(page.getByText("Atiende Ana en horario de oficina.")).toBeVisible();
      await expect(page.getByText("Pidió descuento")).toHaveCount(0);
      await expect(page.getByText("Modificación").first()).toBeVisible();
    });

    test("reportes: pestañas y exportación a Excel", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.getByRole("link", { name: "Reportes" }).click();
      await expect(page.getByText("Emitido y cobrado por mes")).toBeVisible();
      await capturar(page, "admin-reportes");

      const descarga = page.waitForEvent("download");
      await page.getByRole("link", { name: "Exportar a Excel" }).first().click();
      const archivo = await descarga;
      expect(archivo.suggestedFilename()).toMatch(/^cobranza-por-mes-\d{4}-\d{2}-\d{2}\.csv$/);
      const contenido = readFileSync(await archivo.path(), "utf8");
      expect(contenido.startsWith("\uFEFFMes;Órdenes emitidas;Emitido;Cobrado;Pendiente")).toBe(
        true,
      );

      for (const pestana of ["Vencimientos", "Consumos", "Licencias"]) {
        const pestanas = page.getByRole("navigation", { name: "Reportes" });
        await pestanas.getByRole("link", { name: pestana }).click();
        await expect(pestanas.getByRole("link", { name: pestana })).toHaveAttribute(
          "aria-current",
          "page",
        );
      }
      await expect(page.getByText("Tickets de soporte")).toBeVisible();
    });
  });
