import {
  ADMIN,
  capturar,
  cuitAleatorio,
  enlaceEnviadoA,
  expect,
  ingresar,
  registrarCliente,
  test,
} from "./utilidades";

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

test.describe
  .serial("SOFTeam da de alta clientes y empresas", () => {
    const corporativo = `Corporativo ${sufijo} SA`;
    const administrador = `carla.${sufijo}@corporativo.com.ar`;

    test("alta de un cliente que no se registra solo", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/clientes");
      await page.getByRole("link", { name: "Nuevo cliente" }).click();
      await page.getByLabel("Nombre o razón social").fill(corporativo);
      await page.getByLabel("CUIT / CUIL").fill(cuitAleatorio());
      await page.locator("#campo-domicilioFiscal\\.calle").fill("Mitre 500");
      await page.locator("#campo-domicilioFiscal\\.ciudad").fill("Rosario");
      await page.locator("#campo-domicilioFiscal\\.codigoPostal").fill("2000");
      await page.locator("#campo-domicilioFiscal\\.provincia").selectOption("Santa Fe");
      await page.getByLabel("Nombre y apellido").fill("Carla Corp");
      await page.getByLabel("Mail", { exact: true }).fill(administrador);
      await page.getByLabel("Tipo de cliente").selectOption("CORPORATIVO");
      await page.getByRole("button", { name: "Crear cliente" }).click();

      await expect(
        page.getByText("Creamos el cliente, su empresa y el administrador."),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: corporativo })).toBeVisible();
      await expect(page.getByText("Corporativo", { exact: true })).toBeVisible();
      // El administrador recibió el acceso.
      expect(await enlaceEnviadoA(administrador)).toContain("/recuperar");
    });

    test("una empresa más para el mismo cliente", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto(`/admin/clientes?q=${encodeURIComponent(corporativo)}`);
      await page.getByRole("link", { name: corporativo }).first().click();
      await page.getByRole("button", { name: "Nueva empresa" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre de la empresa").fill(`Norte ${sufijo}`);
      await expect(dialogo.getByLabel("Mail del administrador")).toHaveValue(administrador);
      await dialogo.getByRole("button", { name: "Crear empresa" }).click();
      await expect(page.getByText(`Creamos la empresa Norte ${sufijo}.`)).toBeVisible();
      // La tarjeta de la empresa (el nombre también aparece en la actividad).
      await expect(
        page.locator('[data-slot="card-title"]', { hasText: `Norte ${sufijo}` }),
      ).toBeVisible();
    });
  });
