import { capturar, expect, registrarCliente, test } from "./utilidades";

const sufijo = `m${Date.now().toString(36)}`;

test("el administrador crea y edita un tipo de comunicación", async ({ page }) => {
  await registrarCliente(page, `Comunica ${sufijo} SRL`, `comunica.${sufijo}@brokerdelsur.com.ar`);
  await page.getByRole("link", { name: "Comunicaciones" }).click();
  await expect(page.getByText("Todavía no hay tipos de comunicación")).toBeVisible();

  await page.getByRole("button", { name: "Nuevo tipo" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Crear" }).click();
  await expect(dialogo.getByText("Elegí al menos un medio.")).toBeVisible();
  await expect(
    dialogo.getByText("Agregá al menos quién la origina y a quién llega."),
  ).toBeVisible();

  await dialogo.getByLabel("Nombre").fill("Vencimiento de póliza");
  await dialogo.getByRole("checkbox", { name: "Mail" }).click();
  await dialogo.getByRole("checkbox", { name: "WhatsApp" }).click();
  await dialogo.getByRole("button", { name: "Agregar origen" }).click();
  await dialogo.getByLabel("La origina").selectOption({ label: "Productor" });
  await dialogo
    .getByRole("group", { name: "Llega a" })
    .getByRole("button", { name: "Asegurado" })
    .click();
  await dialogo
    .getByRole("group", { name: "La autoriza (opcional)" })
    .getByRole("button", { name: "Administrador de oficina" })
    .click();
  await capturar(page, "portal-comunicacion-nueva");
  await dialogo.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByText("Tipo de comunicación creado.")).toBeVisible();

  await expect(page.getByText("Vencimiento de póliza")).toBeVisible();
  await expect(page.getByText("Autoriza: Administrador de oficina")).toBeVisible();
  await capturar(page, "portal-comunicaciones");

  await page.getByRole("button", { name: "Editar Vencimiento de póliza" }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "Activo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Tipo de comunicación guardado.")).toBeVisible();
  await expect(page.getByText("Inactivo", { exact: true })).toBeVisible();
});
