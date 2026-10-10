import { CAPTURAS, capturar, codigoEnviadoA, cuitAleatorio, expect, test } from "./utilidades";

const sufijo = Date.now().toString(36).toUpperCase();
const email = `ana.${sufijo.toLowerCase()}@brokerdelsur.com.ar`;
const razonSocial = `Broker del Sur ${sufijo} SRL`;
const contrasena = "Broker.Seguro2026";

test.describe
  .serial("recorrido completo", () => {
    test("portada", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("sin llamar a nadie");
      await capturar(page, "01-portada");
    });

    test("alta en línea con verificación del mail", async ({ page }) => {
      await page.goto("/registro");
      await capturar(page, "02-registro");

      // Asistente en tres pasos: no avanza con datos faltantes ni pierde lo cargado.
      await expect(page.getByRole("list", { name: "Pasos del registro" })).toBeVisible();
      await page.getByRole("button", { name: "Siguiente" }).click();
      await expect(page.getByText("Ingresá la razón social")).toBeVisible();
      await expect(page.getByText("El CUIT/CUIL no es válido")).toBeVisible();

      await page.getByLabel("Razón social").fill(razonSocial);
      await page.getByRole("button", { name: "Siguiente" }).click();
      await expect(page.getByText("Ingresá la razón social")).toHaveCount(0);
      await expect(page.getByLabel("Razón social")).toHaveValue(razonSocial);
      await page.getByLabel("Tipo de sociedad").selectOption("SRL");
      await page.getByLabel("Apellido y nombre del administrador").fill("Pérez, Ana");
      await page.getByLabel("CUIT").fill(cuitAleatorio());
      await page.getByLabel("Condición frente al IVA").selectOption("RESPONSABLE_INSCRIPTO");
      await page.getByLabel("Teléfono / WhatsApp").fill("+54 341 444-5555");
      await page.getByRole("button", { name: "Siguiente" }).click();
      await page.getByLabel("Dirección").fill("Córdoba 1234");
      await page.getByLabel("Localidad").fill("Rosario");
      await page.getByLabel("Código postal").fill("2000");
      await page.getByLabel("Provincia").selectOption("Santa Fe");
      await page.getByRole("button", { name: "Siguiente" }).click();
      // Volver no pierde lo cargado.
      await page.getByRole("button", { name: "Anterior" }).click();
      await expect(page.getByLabel("Localidad")).toHaveValue("Rosario");
      await page.getByRole("button", { name: "Siguiente" }).click();
      await page.getByLabel("Mail", { exact: true }).fill(email);
      await page.getByLabel("Contraseña", { exact: true }).fill(contrasena);
      await page.getByLabel("Repetí la contraseña").fill(contrasena);
      // Sin aceptar los términos, el servidor lo rechaza en el último paso.
      await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
      await expect(page.getByText("Revisá los datos marcados.")).toBeVisible();
      await page.getByRole("checkbox", { name: /Acepto los términos y condiciones/ }).click();
      await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();

      await expect(page).toHaveURL(/\/registro\/verificar/);
      await capturar(page, "03-verificar");
      const codigo = await codigoEnviadoA(email);
      await page.getByLabel("Código de verificación").fill(codigo);

      await expect(page).toHaveURL(/\/portal\?bienvenida=1/);
      await expect(page.getByText("¡Tu cuenta está lista!")).toBeVisible();
      await expect(page.getByText("Todavía no tenés paquetes activos")).toBeVisible();
      await capturar(page, "04-portal-inicio");
    });

    test("portal: catálogo, empresa y alta de oficina", async ({ page }) => {
      await page.goto("/ingresar");
      await page.getByLabel("Mail", { exact: true }).fill(email);
      await page.getByLabel("Contraseña").fill(contrasena);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page).toHaveURL(/\/portal$/);

      await page.goto("/portal/paquetes");
      await expect(page.getByText("Prodigal Full")).toBeVisible();
      await capturar(page, "05-portal-paquetes");

      await page.goto("/portal/empresa");
      await expect(page.getByText(razonSocial).first()).toBeVisible();
      await capturar(page, "06-portal-empresa");

      await page.goto("/portal/oficinas");
      await page.getByRole("button", { name: "Nueva oficina" }).click();
      await page.getByLabel("Nombre de la oficina").fill("Sucursal Funes");
      await page.getByRole("button", { name: "Crear oficina" }).click();
      await expect(page.getByText("Oficina 01-002 creada.")).toBeVisible();
      await expect(page.getByText("Sucursal Funes")).toBeVisible();
      await capturar(page, "07-portal-oficinas");
    });

    test("un cliente no puede entrar al panel de SOFTeam", async ({ page }) => {
      await page.goto("/ingresar");
      await page.getByLabel("Mail", { exact: true }).fill(email);
      await page.getByLabel("Contraseña").fill(contrasena);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page).toHaveURL(/\/portal$/);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/portal$/);
    });

    test("login incorrecto no revela si el mail existe", async ({ page }) => {
      await page.goto("/ingresar");
      await page.getByLabel("Mail", { exact: true }).fill(email);
      await page.getByLabel("Contraseña").fill("NoEsLaClave123");
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page.getByText("El mail o la contraseña no son correctos.")).toBeVisible();
    });

    test("SOFTeam: tablero, clientes, alta de paquete y medio de pago", async ({ page }) => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/ingresar\?destino=%2Fadmin/);
      await capturar(page, "08-ingresar");
      await page.getByLabel("Mail", { exact: true }).fill("admin@softeam.local");
      await page.getByLabel("Contraseña").fill("Softeam.2026!");
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByText(razonSocial)).toBeVisible();
      await capturar(page, "09-admin-tablero");

      await page.goto(`/admin/clientes?q=${sufijo}`);
      await page.getByRole("link", { name: razonSocial }).click();
      await expect(page.getByText("Casa central").or(page.getByText("Empresa #"))).toBeTruthy();
      await capturar(page, "10-admin-cliente");

      await page.goto("/admin/paquetes/nuevo");
      await page.getByLabel("Código").fill(`E2E-${Date.now() % 100000}`);
      await page.getByLabel("Nombre", { exact: true }).fill("Paquete de prueba E2E");
      await page.getByLabel("Usuarios").nth(1).fill("2");
      await page.getByRole("textbox", { name: "Precio de compra" }).fill("45000");
      // Privado: el paquete de prueba no aparece en el catálogo de los clientes.
      await page.getByRole("switch", { name: /Privado/ }).click();
      await capturar(page, "11-admin-paquete-nuevo");
      await page.getByRole("button", { name: "Guardar paquete" }).click();
      await expect(page).toHaveURL(/\/admin\/paquetes\?guardado=1/);
      await expect(page.getByText("Paquete de prueba E2E").first()).toBeVisible();
      await capturar(page, "12-admin-paquetes");

      await page.goto("/admin/medios-pago");
      await page.getByRole("button", { name: "Editar" }).first().click();
      await page.getByLabel("Ajuste %").fill("-5");
      await page.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("-5 %").or(page.getByText("−5 %"))).toBeVisible();
      await capturar(page, "13-admin-medios-pago");
    });

    test("celular: portal y menú lateral", async ({ browser }) => {
      const contexto = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await contexto.newPage();
      await page.goto("/ingresar");
      await capturar(page, "14-celular-ingresar");
      await page.getByLabel("Mail", { exact: true }).fill(email);
      await page.getByLabel("Contraseña").fill(contrasena);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page).toHaveURL(/\/portal$/);
      await capturar(page, "15-celular-portal");
      await page.getByRole("button", { name: "Toggle Sidebar" }).click();
      await expect(page.getByRole("link", { name: "Oficinas" })).toBeVisible();
      if (CAPTURAS) {
        await page.screenshot({ path: `${CAPTURAS}/16-celular-menu.png`, caret: "initial" });
      }
      await page.getByRole("link", { name: "Paquetes disponibles" }).click();
      await expect(page).toHaveURL(/\/portal\/paquetes/);
      await capturar(page, "17-celular-paquetes");
      await contexto.close();
    });
  });

test("volver a registrarse con un mail sin confirmar retoma el alta", async ({ page }) => {
  const mail = `retoma.${Date.now().toString(36)}@brokerdelsur.com.ar`;
  const completar = async (razon: string) => {
    await page.goto("/registro");
    await page.getByLabel("Razón social").fill(razon);
    await page.getByLabel("Apellido y nombre del administrador").fill("Pérez, Ana");
    await page.getByLabel("CUIT").fill(cuitAleatorio());
    await page.getByLabel("Condición frente al IVA").selectOption("RESPONSABLE_INSCRIPTO");
    await page.getByLabel("Teléfono / WhatsApp").fill("+54 341 444-5555");
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByLabel("Dirección").fill("Córdoba 1234");
    await page.getByLabel("Localidad").fill("Rosario");
    await page.getByLabel("Código postal").fill("2000");
    await page.getByLabel("Provincia").selectOption("Santa Fe");
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByLabel("Mail", { exact: true }).fill(mail);
    await page.getByLabel("Contraseña", { exact: true }).fill(contrasena);
    await page.getByLabel("Repetí la contraseña").fill(contrasena);
    await page.getByRole("checkbox", { name: /Acepto los términos y condiciones/ }).click();
    await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    await expect(page).toHaveURL(/\/registro\/verificar/);
  };

  // Primer intento: se crea la cuenta, pero no se confirma (se cortó, no llegó…).
  await completar("Retoma Primera SRL");
  // Segundo intento con el mismo mail: no dice "ya existe", retoma el alta.
  await completar("Retoma Segunda SRL");
  await expect(page).toHaveURL(/aviso=pendiente/);
  await expect(page.getByText(/Ya habías empezado el registro con este mail/)).toBeVisible();
  await page.getByLabel("Código de verificación").fill(await codigoEnviadoA(mail));
  await expect(page).toHaveURL(/\/portal\?bienvenida=1/);
  // Quedan los datos del último intento.
  await page.goto("/portal/empresa");
  await expect(page.getByText("Retoma Segunda SRL").first()).toBeVisible();
});
