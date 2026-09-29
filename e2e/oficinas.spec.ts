import { capturar, expect, registrarCliente, test } from "./utilidades";

const sufijo = `o${Date.now().toString(36)}`;

test("el administrador edita su oficina y renombra el canal", async ({ page }) => {
  await registrarCliente(page, `Oficinas ${sufijo} SRL`, `oficinas.${sufijo}@brokerdelsur.com.ar`);
  await page.goto("/portal/oficinas");

  await page.getByRole("button", { name: "Editar la oficina 01-001 Casa central" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("WhatsApp").fill("+54 9 341 555-0000");
  await dialogo.getByLabel("Web").fill("https://broker.com.ar");
  await dialogo.getByRole("checkbox", { name: /Envía notificaciones/ }).click();
  await capturar(page, "portal-oficina-editar");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Oficina actualizada.")).toBeVisible();
  await expect(page.getByText("No notifica")).toBeVisible();

  // La única oficina activa no se puede desactivar.
  await page.getByRole("button", { name: "Editar la oficina 01-001 Casa central" }).click();
  await dialogo.getByRole("checkbox", { name: "Oficina activa" }).click();
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(
    dialogo.getByText("La empresa tiene que conservar al menos una oficina activa."),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Renombrar el canal 01" }).click();
  await page.getByRole("dialog").getByLabel("Nombre del canal").fill("Rosario");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Canal renombrado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Rosario/ })).toBeVisible();
});
