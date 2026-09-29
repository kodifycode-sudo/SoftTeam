import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

export { expect };

export const LOG = process.env.STLIC_LOG_DEV ?? ".data/dev.log";
export const CAPTURAS = process.env.STLIC_CAPTURAS;
export const CONTRASENA = "Broker.Seguro2026";

/** CUIT válido y único (dígito verificador módulo 11). */
export function cuitAleatorio(): string {
  for (;;) {
    const base = `30${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const suma = [...base].reduce((s, d, i) => s + Number(d) * (pesos[i] as number), 0);
    const resto = 11 - (suma % 11);
    if (resto === 10) continue;
    return `${base}${resto === 11 ? 0 : resto}`;
  }
}

/** Espera el código de verificación que el servidor imprimió para ese mail. */
export async function codigoEnviadoA(email: string): Promise<string> {
  for (let intento = 0; intento < 40; intento++) {
    const log = readFileSync(LOG, "utf8");
    const bloques = log.split("📧").filter((b) => b.includes(`Para: ${email}`));
    const codigo = bloques.at(-1)?.match(/Código: (\d{6})/)?.[1];
    if (codigo) return codigo;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el código para ${email}`);
}

/** Espera el enlace (invitación) que el servidor imprimió para ese mail. */
export async function enlaceEnviadoA(email: string): Promise<string> {
  for (let intento = 0; intento < 40; intento++) {
    const log = readFileSync(LOG, "utf8");
    const bloques = log.split("📧").filter((b) => b.includes(`Para: ${email}`));
    const enlace = bloques.at(-1)?.match(/Enlace: (\S+)/)?.[1];
    if (enlace) return enlace;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el enlace para ${email}`);
}

/**
 * Activa un acceso desde el mail de invitación: pide el código, elige la
 * contraseña e ingresa.
 */
export async function activarInvitacion(page: Page, email: string, contrasena = CONTRASENA) {
  const enlace = new URL(await enlaceEnviadoA(email));
  await page.goto(enlace.pathname + enlace.search);
  await expect(page.getByRole("heading", { name: "Activá tu acceso" })).toBeVisible();
  await expect(page.getByLabel("Mail")).toHaveValue(email);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await expect(page).toHaveURL(/\/recuperar\/cambiar/);
  await page.getByLabel("Código", { exact: true }).fill(await codigoEnviadoA(email));
  await page.getByLabel("Contraseña nueva").fill(contrasena);
  await page.getByLabel("Repetí la contraseña").fill(contrasena);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("Listo, guardamos tu contraseña")).toBeVisible();
  await expect(page.getByLabel("Mail", { exact: true })).toHaveValue(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/(admin|portal)/);
}

/**
 * Captura de pantalla para revisar el diseño. Espera a que la página termine
 * de cargar y no toca el cursor: Playwright lo oculta inyectando un estilo en
 * los inputs, y si eso ocurre durante la hidratación React lo reporta como
 * diferencia entre servidor y cliente.
 */
export async function capturar(page: Page, nombre: string) {
  if (!CAPTURAS) return;
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true, caret: "initial" });
}

/** Da de alta un cliente nuevo por la pantalla de registro y lo deja dentro del portal. */
export async function registrarCliente(page: Page, razonSocial: string, email: string) {
  await page.goto("/registro");
  await page.getByLabel("Razón social").fill(razonSocial);
  await page.getByLabel("Tipo de sociedad").selectOption("SRL");
  await page.getByLabel("Apellido y nombre del administrador").fill("Pérez, Ana");
  await page.getByLabel("CUIT").fill(cuitAleatorio());
  await page.getByLabel("Condición frente al IVA").selectOption("RESPONSABLE_INSCRIPTO");
  await page.getByLabel("Teléfono / WhatsApp").fill("+54 341 444-5555");
  await page.getByLabel("Dirección").fill("Córdoba 1234");
  await page.getByLabel("Localidad").fill("Rosario");
  await page.getByLabel("Código postal").fill("2000");
  await page.getByLabel("Provincia").selectOption("Santa Fe");
  await page.getByLabel("Mail", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(CONTRASENA);
  await page.getByLabel("Repetí la contraseña").fill(CONTRASENA);
  await page.getByRole("checkbox", { name: "Acepto las condiciones de uso" }).click();
  await page.getByRole("button", { name: "Crear cuenta y continuar" }).click();
  await expect(page).toHaveURL(/\/registro\/verificar/);
  await page.getByLabel("Código de verificación").fill(await codigoEnviadoA(email));
  await expect(page).toHaveURL(/\/portal\?bienvenida=1/);
}

export async function ingresar(page: Page, email: string, contrasena: string) {
  await enviarContrasena(page, email, contrasena);
  await expect(page).toHaveURL(/\/(admin|portal)/);
}

/** Ingresa mail y contraseña sin esperar el panel (con 2FA, sigue el código). */
export async function enviarContrasena(page: Page, email: string, contrasena: string) {
  await page.goto("/ingresar");
  await page.getByLabel("Mail", { exact: true }).fill(email);
  await page.getByLabel("Contraseña").fill(contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

/**
 * Código TOTP de 6 dígitos (RFC 6238, pasos de 30 s) para una clave en
 * base32, como el que muestra la app de autenticación.
 */
export function codigoTotp(claveBase32: string): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of claveBase32.replace(/=+$/, "").toUpperCase()) {
    bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => Number.parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", bytes).update(contador).digest();
  const inicio = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const numero = (hmac.readUInt32BE(inicio) & 0x7fffffff) % 1_000_000;
  return String(numero).padStart(6, "0");
}

/** Administrador inicial. Sobre la base de la demo (npm run db:demo) su clave es "admin123". */
export const ADMIN = {
  email: "admin@softeam.local",
  contrasena: process.env.E2E_ADMIN_PASSWORD ?? "Softeam.2026!",
};

/**
 * `test` con control de consola: si el navegador registra un error (errores
 * de hidratación, excepciones no capturadas), el test falla aunque la
 * pantalla se vea bien.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: así declara Playwright los fixtures sin valor.
export const test = base.extend<{ consolaLimpia: void }>({
  consolaLimpia: [
    async ({ page }, usar) => {
      const errores: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        // Una página 403/404 buscada a propósito (forbidden(), notFound()) no es un error.
        const esElDocumento = m.location().url === page.url();
        if (esElDocumento && /status of 40[34]/.test(m.text())) return;
        errores.push(`[${page.url()}] ${m.text()}`);
      });
      page.on("pageerror", (e) => errores.push(`[${page.url()}] ${e.message}`));
      await usar();
      expect(errores, "errores en la consola del navegador").toEqual([]);
    },
    { auto: true },
  ],
});
