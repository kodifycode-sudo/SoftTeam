import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { ADMIN, expect, ingresar, registrarCliente, test } from "./utilidades";

async function descargar(page: Page, abrir: () => Promise<void>) {
  const descarga = page.waitForEvent("download");
  await abrir();
  const archivo = await descarga;
  return {
    nombre: archivo.suggestedFilename(),
    contenido: readFileSync(await archivo.path(), "utf8"),
  };
}

test("SOFTeam exporta el catálogo de aseguradoras y de paquetes", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.contrasena);
  await page.goto("/admin/aseguradoras");
  const aseguradoras = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar a Excel" }).click(),
  );
  expect(aseguradoras.nombre).toMatch(/^aseguradoras-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(aseguradoras.contenido.startsWith("\uFEFFNombre;Abreviatura;Código SSN")).toBe(true);

  await page.goto("/admin/paquetes");
  const paquetes = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar a Excel" }).click(),
  );
  expect(paquetes.contenido).toContain("PRO-INICIAL;Prodigal Inicial;Temporal");
});

test("el administrador exporta usuarios, productores y códigos", async ({ page }) => {
  const sufijo = `X${Date.now().toString(36).toUpperCase()}`;
  const email = `exporta.${sufijo.toLowerCase()}@brokerdelsur.com.ar`;
  await registrarCliente(page, `Seguros ${sufijo} SRL`, email);

  await page.goto("/portal/usuarios");
  const usuarios = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar a Excel" }).click(),
  );
  expect(usuarios.nombre).toMatch(/^usuarios-/);
  expect(usuarios.contenido.startsWith("\uFEFFNúmero de empresa;Nombre;Mail")).toBe(true);
  expect(usuarios.contenido).toContain(email);

  await page.goto("/portal/productores");
  await page.getByRole("button", { name: "Exportar a Excel" }).click();
  const productores = await descargar(page, () =>
    page.getByRole("menuitem", { name: "Productores" }).click(),
  );
  expect(productores.contenido.startsWith("\uFEFFNúmero de empresa;Id del productor;Nombre")).toBe(
    true,
  );
  await page.getByRole("button", { name: "Exportar a Excel" }).click();
  const codigos = await descargar(page, () =>
    page.getByRole("menuitem", { name: "Códigos por compañía" }).click(),
  );
  expect(codigos.nombre).toMatch(/^codigos-de-productores-/);
});
