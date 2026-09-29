import { ADMIN, capturar, expect, ingresar, test } from "./utilidades";

test("Administración cambia un parámetro; un valor inválido no se guarda", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.contrasena);
  await page.goto("/admin/parametros");
  const saldo = page.getByRole("textbox", { name: "Saldo bajo (%)" });
  await expect(saldo).toHaveValue("20");

  await saldo.fill("150");
  await page.getByRole("button", { name: "Guardar Saldo bajo (%)" }).click();
  await expect(page.getByText("Entre 1 y 99.")).toBeVisible();

  await page.getByRole("textbox", { name: "Saldo bajo (%)" }).fill("25");
  await page.getByRole("button", { name: "Guardar Saldo bajo (%)" }).click();
  await expect(page.getByText('Guardamos "Saldo bajo (%)".')).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Saldo bajo (%)" })).toHaveValue("25");
  await capturar(page, "admin-parametros");

  const corte = page.getByRole("textbox", { name: "Días de generación de las renovaciones" });
  await corte.fill("20, 5");
  await page
    .getByRole("button", { name: "Guardar Días de generación de las renovaciones" })
    .click();
  await expect(page.getByText("El primer día tiene que ser anterior al segundo.")).toBeVisible();

  // Se deja como estaba: los demás recorridos usan el valor original.
  await page.getByRole("textbox", { name: "Saldo bajo (%)" }).fill("20");
  await page.getByRole("button", { name: "Guardar Saldo bajo (%)" }).click();
  await expect(page.getByText('Guardamos "Saldo bajo (%)".')).toBeVisible();
});

test("Administración cambia el factor de un medio de envío", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.contrasena);
  await page.goto("/admin/parametros");
  const sms = page.getByRole("textbox", { name: "SMS (créditos por envío)" });
  await expect(sms).toHaveValue("2");

  await sms.fill("0");
  await page.getByRole("button", { name: "Guardar SMS" }).click();
  await expect(
    page.getByText("Un factor mayor que 0 y hasta 100 (hasta dos decimales)."),
  ).toBeVisible();

  await page.getByRole("textbox", { name: "SMS (créditos por envío)" }).fill("2,5");
  await page.getByRole("button", { name: "Guardar SMS" }).click();
  await expect(page.getByText("Guardamos el medio de envío.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "SMS (créditos por envío)" })).toHaveValue("2,5");
  // El mail, medio por defecto, no se puede desactivar.
  await expect(page.locator("#medio-mail-activo")).toBeDisabled();
  await capturar(page, "admin-medios-envio");

  // Se deja como estaba.
  await page.getByRole("textbox", { name: "SMS (créditos por envío)" }).fill("2");
  await page.getByRole("button", { name: "Guardar SMS" }).click();
  await expect(page.getByText("Guardamos el medio de envío.")).toBeVisible();
});
