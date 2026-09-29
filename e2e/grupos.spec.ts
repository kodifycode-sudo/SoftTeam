import { ADMIN, capturar, expect, ingresar, registrarCliente, test } from "./utilidades";

const sufijo = `g${Date.now().toString(36)}`;
const razonSocial = `Grupo ${sufijo} SRL`;
const corto = `G${sufijo.slice(-6).toUpperCase()}`;

test.describe
  .serial("grupos económicos", () => {
    test("un cliente se registra", async ({ page }) => {
      await registrarCliente(page, razonSocial, `grupo.${sufijo}@brokerdelsur.com.ar`);
    });

    test("SOFTeam crea un grupo con ese cliente como principal", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto(`/admin/clientes?q=${encodeURIComponent(razonSocial)}`);
      await page.getByRole("link", { name: razonSocial }).first().click();
      const numero =
        (await page.getByText(/^Cliente #\d+$/).textContent())?.replace(/\D/g, "") ?? "";

      await page.goto("/admin/grupos");
      await page.getByRole("button", { name: "Nuevo grupo" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre", { exact: true }).fill(`Red ${sufijo}`);
      await dialogo.getByLabel("Nombre corto").fill(corto);
      await dialogo.getByLabel("Cliente principal (CUIT o número, opcional)").fill(numero);
      await dialogo.getByRole("button", { name: "Crear grupo" }).click();

      await expect(page.getByRole("heading", { name: `Red ${sufijo}` })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(razonSocial) }).first()).toBeVisible();
      await expect(page.getByText("Principal", { exact: true })).toBeVisible();
      await capturar(page, "admin-grupo");

      // Un cliente inexistente no se suma.
      await page.getByLabel("Sumar un cliente (CUIT o número)").fill("99999999");
      await page.getByRole("button", { name: "Sumar" }).click();
      await expect(page.getByText("No hay un cliente con ese CUIT o número.")).toBeVisible();

      await page.getByRole("button", { name: `Sacar a ${razonSocial} del grupo` }).click();
      await expect(page.getByText("Todavía no hay clientes en el grupo.")).toBeVisible();
      await page.getByRole("button", { name: "Borrar grupo" }).click();
      await expect(page).toHaveURL(/\/admin\/grupos$/);
      await expect(page.getByText(`Red ${sufijo}`)).toHaveCount(0);
    });
  });
