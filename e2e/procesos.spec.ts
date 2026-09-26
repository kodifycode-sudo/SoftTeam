import {
  ADMIN,
  CONTRASENA,
  capturar,
  expect,
  ingresar,
  registrarCliente,
  test,
} from "./utilidades";

const sufijo = Date.now().toString(36);
const razonSocial = `Procesos ${sufijo} SRL`;
const email = `procesos.${sufijo}@brokerdelsur.com.ar`;

test.describe
  .serial("procesos programados y avisos", () => {
    test("un cliente nuevo, todavía sin paquetes", async ({ page }) => {
      await registrarCliente(page, razonSocial, email);
      await expect(page.getByRole("link", { name: "Avisos", exact: true }).first()).toBeVisible();
    });

    test("SOFTeam ejecuta los procesos del día y ve las alertas", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.getByRole("link", { name: "Procesos y alertas" }).click();
      await page.getByRole("button", { name: "Ejecutar ahora" }).click();
      await expect(page.getByText(/Renovación listo, diario listo/)).toBeVisible({
        timeout: 60_000,
      });
      const diario = page
        .getByRole("region", { name: "Procesos" })
        .locator("[data-slot=card]")
        .filter({ hasText: "Proceso diario" });
      await expect(diario.getByText("Listo")).toBeVisible();

      await page.getByLabel("Tipo de alerta").selectOption("EMPRESA_SIN_PAQUETE");
      await page.getByRole("button", { name: "Filtrar" }).click();
      await expect(page.getByRole("row").filter({ hasText: razonSocial })).toBeVisible();
      await capturar(page, "admin-procesos");
    });

    test("el cliente recibe el aviso en el portal", async ({ page }) => {
      await ingresar(page, email, CONTRASENA);
      const campana = page.getByRole("link", { name: /^Avisos: \d+ sin leer$/ });
      await expect(campana).toBeVisible();
      await campana.click();
      await expect(page.getByRole("heading", { name: "Avisos" })).toBeVisible();
      await expect(page.getByText(`${razonSocial} no tiene paquetes vigentes`)).toBeVisible();
      await capturar(page, "portal-avisos");

      await page.getByRole("button", { name: "Marcar todo como leído" }).click();
      await expect(page.getByRole("button", { name: "Marcar todo como leído" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^Avisos: \d+ sin leer$/ })).toHaveCount(0);
    });
  });
