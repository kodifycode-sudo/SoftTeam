import { ADMIN, capturar, expect, ingresar, registrarCliente, test } from "./utilidades";

const sufijo = `e${Date.now().toString(36)}`;
const email = `edicion.${sufijo}@brokerdelsur.com.ar`;
const razonSocial = `Edición ${sufijo} SRL`;

test.describe
  .serial("SOFTeam edita clientes y empresas", () => {
    test("el cliente se registra y ve la opción de 2FA, que es opcional", async ({ page }) => {
      await registrarCliente(page, razonSocial, email);
      await page.locator("[data-slot=sidebar-footer]").getByRole("button").click();
      await page.getByRole("menuitem", { name: "Seguridad de la cuenta" }).click();
      await expect(page).toHaveURL(/\/portal\/seguridad/);
      await expect(page.getByText("Es opcional.", { exact: false })).toBeVisible();
      await expect(page.getByText("Desactivada")).toBeVisible();
    });

    test("SOFTeam corrige los datos fiscales y los contactos", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto(`/admin/clientes?q=${encodeURIComponent(razonSocial)}`);
      await page.getByRole("link", { name: razonSocial }).first().click();
      await page.getByRole("link", { name: "Editar datos" }).click();
      await expect(page.getByRole("heading", { name: "Editar datos del cliente" })).toBeVisible();

      await page.getByLabel("Nombre en la factura").fill(`${razonSocial} (nuevo)`);
      await page.getByLabel("Condición frente al IVA").selectOption("MONOTRIBUTO");
      // Un domicilio comercial a medias se rechaza sin perder lo tipeado.
      // (el alta copia el domicilio fiscal como comercial: se borra la localidad)
      await page.locator("#campo-domicilioComercial\\.calle").fill("San Martín 100");
      await page.locator("#campo-domicilioComercial\\.ciudad").fill("");
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await expect(page.getByText("Completá el domicilio comercial o dejalo vacío")).toBeVisible();
      await expect(page.getByLabel("Nombre en la factura")).toHaveValue(`${razonSocial} (nuevo)`);
      await page.locator("#campo-domicilioComercial\\.ciudad").fill("Rosario");

      await page.locator("#campo-pagos\\.nombre").fill("Pablo Pagos");
      await page.locator("#campo-pagos\\.email").fill(`pagos.${sufijo}@brokerdelsur.com.ar`);
      await capturar(page, "admin-cliente-editar");
      await page.getByRole("button", { name: "Guardar cambios" }).click();

      await expect(page.getByText("Guardamos los datos del cliente.")).toBeVisible();
      await expect(page.getByText(`${razonSocial} (nuevo)`)).toBeVisible();
      await expect(page.getByText("Monotributo")).toBeVisible();
      await expect(page.getByText("Pablo Pagos")).toBeVisible();
    });

    test("SOFTeam corrige la empresa", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto(`/admin/clientes?q=${encodeURIComponent(razonSocial)}`);
      await page.getByRole("link", { name: razonSocial }).first().click();
      await page
        .getByRole("button", { name: /Editar la empresa/ })
        .first()
        .click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre corto").fill("NUEVO");
      await dialogo.getByLabel("Tipo de cliente").selectOption("CORPORATIVO");
      await dialogo.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Empresa actualizada.")).toBeVisible();
      await expect(page.getByText("Corporativo", { exact: true })).toBeVisible();
      await expect(page.getByText(/· NUEVO/)).toBeVisible();
    });
  });
