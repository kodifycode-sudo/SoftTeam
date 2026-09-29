import { ADMIN, capturar, expect, ingresar, test } from "./utilidades";

// Códigos únicos por corrida: la base de desarrollo conserva lo de corridas anteriores.
const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const n = Date.now();
const codigoMoneda = `Q${letras[n % 26]}${letras[Math.floor(n / 26) % 26]}`;
const codigoPais = `Q${letras[Math.floor(n / 676) % 26]}`;

test("Administración configura una moneda, un país y sus provincias", async ({ page }) => {
  await ingresar(page, ADMIN.email, ADMIN.contrasena);
  await page.getByRole("link", { name: "Países y monedas" }).click();
  await expect(page.getByRole("cell", { name: /ARS · Peso argentino/ })).toBeVisible();
  await expect(page.getByText("Provincias de Argentina", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Córdoba", exact: true })).toBeVisible();

  // El peso es la base: no se desactiva.
  await page.getByRole("button", { name: "Editar ARS" }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "Activa" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(
    page.getByRole("dialog").getByText("El peso argentino es la moneda base"),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Nueva moneda" }).click();
  let dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Código (ISO 4217)").fill(codigoMoneda);
  await dialogo.getByLabel("Nombre").fill("Moneda de prueba");
  await dialogo.getByLabel("Símbolo").fill("$Q");
  await dialogo.getByLabel("Cotización (pesos por unidad)").fill("0");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(dialogo.getByText("Un número mayor que 0 (hasta 6 decimales).")).toBeVisible();
  await dialogo.getByLabel("Cotización (pesos por unidad)").fill("25,5");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(`Guardamos la moneda ${codigoMoneda}.`)).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(codigoMoneda) }).getByRole("cell", { name: "25,5" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nuevo país" }).click();
  dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Código (ISO 3166)").fill(codigoPais);
  await dialogo.getByLabel("Nombre", { exact: true }).fill(`País ${codigoPais}`);
  await dialogo.getByLabel("Prefijo telefónico").fill("598");
  await dialogo.getByLabel("Moneda").selectOption(codigoMoneda);
  await dialogo.getByLabel("IVA general (%)").fill("22");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(`Guardamos País ${codigoPais}.`)).toBeVisible();

  await page.getByRole("link", { name: `Provincias de País ${codigoPais}: 0` }).click();
  await expect(page.getByText(`Provincias de País ${codigoPais}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nueva provincia" }).click();
  dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Código").fill("MO");
  await dialogo.getByLabel("Nombre").fill("Montevideo");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardamos Montevideo.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Montevideo", exact: true })).toBeVisible();
  await capturar(page, "admin-paises");

  // Se deja inactivo para no ofrecerlo en otros recorridos.
  await page.getByRole("button", { name: `Editar País ${codigoPais}` }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: "Activo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(`Guardamos País ${codigoPais}.`)).toBeVisible();
});
