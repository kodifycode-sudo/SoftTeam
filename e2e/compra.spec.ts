import {
  ADMIN,
  CONTRASENA,
  capturar,
  expect,
  ingresar,
  registrarCliente,
  test,
} from "./utilidades";

const sufijo = `C${Date.now().toString(36).toUpperCase()}`;
const email = `compras.${sufijo.toLowerCase()}@brokerdelsur.com.ar`;
const razonSocial = `Seguros ${sufijo} SRL`;
let numeroOrden = "";

test.describe
  .serial("compra de paquetes", () => {
    test("el cliente arma el carrito y confirma la orden", async ({ page }) => {
      await registrarCliente(page, razonSocial, email);

      await page.goto("/portal/paquetes");
      await page
        .getByRole("button", { name: "Agregar Prodigal Inicial · Mensual al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Carrito: 1 unidades" })).toBeVisible();

      await page.goto("/portal/paquetes?tipo=CONSUMIBLE");
      await page
        .getByRole("button", { name: "Agregar Notificaciones 10.000 · Pago único al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();

      await page.goto("/portal/carrito");
      await expect(page.getByText("Prodigal Inicial", { exact: true })).toBeVisible();
      // Medio sin ajuste, para verificar el cálculo: 2 × 38.000 + 30.000 = 106.000 + 21 % IVA.
      await page.getByRole("link", { name: /Link de pago/ }).click();
      await expect(page.getByRole("link", { name: /Link de pago/ })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await page.getByRole("button", { name: "Una unidad más" }).first().click();
      await expect(page.getByText("$ 128.260,00").first()).toBeVisible();
      await capturar(page, "20-carrito");

      // Un código inexistente se rechaza con un mensaje genérico y no rompe el total.
      await page.getByLabel("Código de descuento").fill("NOEXISTE");
      await page.getByRole("button", { name: "Aplicar" }).click();
      await expect(
        page.getByText("El código no es válido o no aplica a esta orden."),
      ).toBeVisible();

      await page.getByRole("link", { name: /Transferencia bancaria/ }).click();
      await expect(page.getByRole("link", { name: /Transferencia bancaria/ })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page.getByText(/Pagás con Transferencia bancaria/)).toBeVisible();
      await page.getByRole("checkbox", { name: /Revisé los paquetes/ }).click();
      await page.getByRole("button", { name: "Confirmar orden" }).click();

      await expect(page).toHaveURL(/\/portal\/ordenes\/[0-9a-f-]{36}\?nueva=1/);
      await expect(page.getByText("¡Orden confirmada!")).toBeVisible();
      await expect(page.getByText("Cómo pagar: Transferencia bancaria")).toBeVisible();
      await expect(page.getByText("Pendiente de pago")).toBeVisible();
      numeroOrden =
        (await page.getByRole("heading", { level: 1 }).textContent())?.replace(/\D/g, "") ?? "";
      expect(numeroOrden).not.toBe("");
      await capturar(page, "21-orden-confirmada");

      // El carrito quedó vacío.
      await expect(page.getByRole("link", { name: "Carrito vacío" })).toBeVisible();
    });

    test("SOFTeam registra el pago", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/ordenes");
      await capturar(page, "22-admin-ordenes");
      await page
        .getByRole("link", { name: `#${numeroOrden}` })
        .first()
        .click();
      await page.getByRole("button", { name: "Registrar pago" }).click();
      await page.getByRole("button", { name: "Sí, registrar pago" }).click();
      await expect(page.getByText("Pago registrado: 2 paquetes activados.")).toBeVisible();
      await expect(page.getByText("Pagada", { exact: true })).toBeVisible();
      await capturar(page, "23-admin-orden-pagada");
    });

    test("el cliente ve su licencia activa", async ({ page }) => {
      await ingresar(page, email, CONTRASENA);
      await expect(page.getByRole("heading", { name: "Tu licencia hoy" })).toBeVisible();
      await expect(page.getByText("Prodigal · Gestión")).toBeVisible();
      await expect(page.getByText("10.000").first()).toBeVisible();
      await capturar(page, "24-portal-licencia");
      await page.goto("/portal/ordenes");
      await expect(page.getByText("Pagada").first()).toBeVisible();
    });
  });
