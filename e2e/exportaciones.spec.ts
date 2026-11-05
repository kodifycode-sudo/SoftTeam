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

test("SOFTeam da de alta un medio de pago y lo exporta", async ({ page }) => {
  const codigo = `E2E_${Date.now().toString(36).toUpperCase()}`;
  await ingresar(page, ADMIN.email, ADMIN.contrasena);
  await page.goto("/admin/medios-pago");
  await page.getByRole("button", { name: "Nuevo medio de pago" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Código").fill(codigo);
  await dialogo.getByLabel("Tipo", { exact: true }).selectOption("PLANILLA");
  await dialogo.getByLabel("Nombre", { exact: true }).fill(`Planilla ${codigo}`);
  await dialogo.getByRole("switch", { name: "Factura agrupada con transferencia" }).click();
  // Inactivo: no se ofrece en las compras de las otras pruebas.
  await dialogo.getByRole("switch", { name: "Medio activo" }).click();
  await dialogo.getByRole("button", { name: "Agregar medio de pago" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText(`Planilla ${codigo}`, { exact: true })).toBeVisible();

  // El código repetido se rechaza en el campo.
  await page.getByRole("button", { name: "Nuevo medio de pago" }).click();
  await dialogo.getByLabel("Código").fill(codigo);
  await dialogo.getByLabel("Tipo", { exact: true }).selectOption("TRANSFERENCIA");
  await dialogo.getByLabel("Nombre", { exact: true }).fill("Repetido");
  await dialogo.getByRole("switch", { name: "Factura adelantada" }).click();
  await dialogo.getByRole("button", { name: "Agregar medio de pago" }).click();
  await expect(dialogo.getByText("Ya hay un medio de pago con ese código.")).toBeVisible();
  await page.keyboard.press("Escape");

  const medios = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar a Excel" }).click(),
  );
  expect(medios.nombre).toMatch(/^medios-de-pago-/);
  expect(medios.contenido).toContain(
    `${codigo};Planilla ${codigo};Planilla (cobro consolidado);Todos`,
  );
});

test("SOFTeam exporta emisores, grupos, países, tickets y usuarios", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.contrasena);
  const casos = [
    ["/admin/emisores", /^emisores-/, "Razón social;CUIT"],
    ["/admin/grupos", /^grupos-economicos-/, "Grupo;Nombre corto"],
    ["/admin/paises", /^paises-/, "Código;País"],
    ["/admin/tickets", /^tickets-/, "Código;Descripción;Porcentaje;Tope"],
    ["/admin/usuarios", /^usuarios-softeam-/, "Nombre;Mail;Rol"],
  ] as const;
  for (const [ruta, nombre, encabezado] of casos) {
    await page.goto(ruta);
    const archivo = await descargar(page, () =>
      page.getByRole("link", { name: "Exportar a Excel" }).click(),
    );
    expect(archivo.nombre).toMatch(nombre);
    expect(archivo.contenido.startsWith(`\uFEFF${encabezado}`)).toBe(true);
  }
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
  const productores = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar a Excel" }).click(),
  );
  expect(productores.contenido.startsWith("\uFEFFNúmero de empresa;Id del productor;Nombre")).toBe(
    true,
  );
  const codigos = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar códigos" }).click(),
  );
  expect(codigos.nombre).toMatch(/^codigos-de-productores-/);

  await page.goto("/portal/oficinas");
  const oficinas = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar a Excel" }).click(),
  );
  expect(oficinas.nombre).toMatch(/^oficinas-/);
  expect(oficinas.contenido.startsWith("\uFEFFCanal;Nombre del canal;Oficina")).toBe(true);

  await page.goto("/portal/aseguradoras");
  const aseguradoras = await descargar(page, () =>
    page.getByRole("link", { name: "Exportar a Excel" }).click(),
  );
  expect(aseguradoras.nombre).toMatch(/^aseguradoras-/);
  expect(aseguradoras.contenido.startsWith("\uFEFFNombre;Abreviatura;Código SSN")).toBe(true);
});
