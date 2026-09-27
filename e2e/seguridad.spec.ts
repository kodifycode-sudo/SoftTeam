import {
  ADMIN,
  activarInvitacion,
  CONTRASENA,
  capturar,
  codigoTotp,
  enviarContrasena,
  expect,
  ingresar,
  test,
} from "./utilidades";

const sufijo = Date.now().toString(36);
const usuario = `seguridad.${sufijo}@softeam.com.ar`;
let clave = "";
let respaldo = "";

test.describe
  .serial("verificación en dos pasos de SOFTeam", () => {
    test("Administración invita a una persona de SOFTeam", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/usuarios");
      await page.getByRole("button", { name: "Invitar usuario" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre y apellido").fill("Sergio Seguro");
      await dialogo.getByLabel("Mail").fill(usuario);
      await dialogo.getByLabel("Rol").selectOption("SOPORTE");
      await dialogo.getByRole("button", { name: "Enviar invitación" }).click();
      await expect(page.getByText(`Invitamos a ${usuario}.`)).toBeVisible();
    });

    test("activa el 2FA escaneando el QR y guarda los códigos de respaldo", async ({ page }) => {
      await activarInvitacion(page, usuario);
      await expect(page).toHaveURL(/\/admin/);
      await expect(
        page.getByText("Protegé tu usuario con la verificación en dos pasos"),
      ).toBeVisible();
      await page.getByRole("link", { name: "Activarla ahora" }).click();

      await page.getByLabel("Tu contraseña").fill("incorrecta-1234");
      await page.getByRole("button", { name: "Empezar a activarla" }).click();
      await expect(page.getByText("La contraseña no es correcta.")).toBeVisible();
      await page.getByLabel("Tu contraseña").fill(CONTRASENA);
      await page.getByRole("button", { name: "Empezar a activarla" }).click();

      await expect(page.getByAltText("Código QR para la app de autenticación")).toBeVisible();
      clave = (await page.locator("code").textContent()) ?? "";
      const codigos = page.getByRole("list", { name: "Códigos de respaldo" }).getByRole("listitem");
      await expect(codigos).toHaveCount(10);
      respaldo = (await codigos.first().textContent()) ?? "";
      await capturar(page, "admin-seguridad-activar");

      await page.getByLabel("Código de la app").fill("000000");
      await page.getByRole("button", { name: "Activar" }).click();
      await expect(page.getByText(/El código no es correcto/)).toBeVisible();
      await page.getByLabel("Código de la app").fill(codigoTotp(clave));
      await page.getByRole("button", { name: "Activar" }).click();
      await expect(
        page.getByText("Listo: la verificación en dos pasos está activa."),
      ).toBeVisible();
      await expect(page.getByText("Activa", { exact: true })).toBeVisible();
    });

    test("al ingresar pide el código; sirve el de la app o uno de respaldo", async ({ page }) => {
      await enviarContrasena(page, usuario, CONTRASENA);
      await expect(page).toHaveURL(/\/ingresar\/codigo/);
      await capturar(page, "ingresar-codigo");
      // Sin el código no hay sesión.
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/ingresar/);

      await enviarContrasena(page, usuario, CONTRASENA);
      await page.getByRole("button", { name: /usar un código de respaldo/ }).click();
      await page.getByLabel("Código de respaldo").fill("no-existe-000");
      await page.getByRole("button", { name: "Verificar y entrar" }).click();
      await expect(
        page.getByText("Ese código de respaldo no es válido o ya se usó."),
      ).toBeVisible();
      await page.getByLabel("Código de respaldo").fill(respaldo);
      await page.getByRole("button", { name: "Verificar y entrar" }).click();
      await expect(page).toHaveURL(/\/admin/);

      // El mismo código de respaldo no sirve dos veces.
      await page.context().clearCookies();
      await enviarContrasena(page, usuario, CONTRASENA);
      await page.getByRole("button", { name: /usar un código de respaldo/ }).click();
      await page.getByLabel("Código de respaldo").fill(respaldo);
      await page.getByRole("button", { name: "Verificar y entrar" }).click();
      await expect(
        page.getByText("Ese código de respaldo no es válido o ya se usó."),
      ).toBeVisible();

      // Con el código de la app.
      await page.getByRole("button", { name: /Usar el código de la app/ }).click();
      await page.getByLabel("Código de la app").fill(codigoTotp(clave));
      await expect(page).toHaveURL(/\/admin/);
    });

    test("Administración le quita el 2FA a quien perdió el celular", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/usuarios");
      await page
        .getByRole("button", { name: "Quitar verificación en dos pasos de Sergio Seguro" })
        .first()
        .click();
      await page.getByRole("dialog").getByRole("button", { name: "Quitar 2FA" }).click();
      await expect(page.getByText(/entra solo con la contraseña/)).toBeVisible();

      await page.context().clearCookies();
      await ingresar(page, usuario, CONTRASENA);
      await expect(page).toHaveURL(/\/admin/);
    });
  });
