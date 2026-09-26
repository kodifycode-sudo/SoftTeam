import { ADMIN, capturar, expect, ingresar, registrarCliente, test } from "./utilidades";

const sufijo = Date.now().toString(36).toUpperCase();
const ticket = `PROMO-${sufijo}`;
const email = `cobros.${sufijo.toLowerCase()}@brokerdelsur.com.ar`;
let urlOrden = "";

test.describe
  .serial("cobro con link de pago, ticket y factura", () => {
    test("SOFTeam crea un ticket de descuento", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.getByRole("link", { name: "Tickets" }).click();
      await page.getByRole("button", { name: "Nuevo ticket" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Código").fill(ticket.toLowerCase());
      await dialogo.getByLabel("Descuento (%)").fill("10");
      await dialogo.getByLabel("Tope total ($)").fill("100000");
      await dialogo.getByLabel("Hasta").fill("2027-12-31");
      await dialogo.getByRole("button", { name: "Crear ticket" }).click();
      await expect(page.getByText(`Ticket ${ticket} creado.`)).toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: ticket })).toBeVisible();
    });

    test("el cliente compra con link de pago y el ticket", async ({ page }) => {
      await registrarCliente(page, `Cobros ${sufijo} SRL`, email);
      await page.goto("/portal/paquetes");
      await page
        .getByRole("button", { name: "Agregar Prodigal Inicial · Mensual al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();
      await page.goto("/portal/carrito");
      await page.getByRole("link", { name: /Link de pago/ }).click();
      await expect(page.getByRole("link", { name: /Link de pago/ })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await page.getByLabel("Código de descuento").fill(ticket);
      await page.getByRole("button", { name: "Aplicar" }).click();
      await expect(page.getByText(`Descuento ${ticket} (10 %)`).first()).toBeVisible();
      // 38.000 − 10 % = 34.200, más 21 % de IVA.
      await expect(page.getByText("$ 41.382,00").first()).toBeVisible();
      await page.getByRole("checkbox", { name: /Revisé los paquetes/ }).click();
      await page.getByRole("button", { name: "Confirmar orden" }).click();
      await expect(page).toHaveURL(/\/portal\/ordenes\/[0-9a-f-]{36}\?nueva=1/);
      await expect(page.getByRole("button", { name: "Pagar ahora" })).toBeVisible();
      urlOrden = new URL(page.url()).pathname;
    });

    test("un pago rechazado se informa y se puede reintentar", async ({ page }) => {
      await ingresar(page, email, "Broker.Seguro2026");
      await page.goto(urlOrden);
      await page.getByRole("button", { name: "Pagar ahora" }).click();
      await expect(page).toHaveURL(/\/simulador\/pago\//);
      await expect(page.getByText("$ 41.382,00")).toBeVisible();
      await capturar(page, "simulador-pago");
      await page.getByRole("button", { name: "Rechazar (sin fondos)" }).click();

      await expect(page).toHaveURL(/pago=rechazado/);
      await expect(page.getByText("No se pudo cobrar el último intento de pago")).toBeVisible();
      await page.getByRole("button", { name: "Reintentar el pago" }).click();
      await page.getByRole("button", { name: "Aprobar pago" }).click();

      await expect(page.getByText("¡Pago acreditado!")).toBeVisible();
      await expect(page.getByText("Pagada", { exact: true }).first()).toBeVisible();
      // La factura se emite apenas termina el aviso de pago.
      await expect(async () => {
        await page.reload();
        await expect(page.getByText(/Comprobante A 0001-\d{8}/)).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await capturar(page, "portal-orden-pagada");
    });

    test("SOFTeam ve el ticket consumido", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/tickets");
      const fila = page.getByRole("row").filter({ hasText: ticket });
      await expect(fila.getByText("$ 3.800,00")).toBeVisible();
      await capturar(page, "admin-tickets");
    });
  });
