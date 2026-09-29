import {
  ADMIN,
  activarInvitacion,
  CONTRASENA,
  capturar,
  codigoEnviadoA,
  expect,
  ingresar,
  registrarCliente,
  test,
} from "./utilidades";

const sufijo = Date.now().toString(36);
const administrador = `config.${sufijo}@brokerdelsur.com.ar`;
const operativo = `operativo.${sufijo}@brokerdelsur.com.ar`;
const soporte = `soporte.${sufijo}@softeam.com.ar`;
const nuevaContrasena = "Otra.Clave2026";

test.describe
  .serial("Configuración de la empresa y perfiles", () => {
    test("el administrador general da de alta un usuario con permiso de configuración", async ({
      page,
    }) => {
      await registrarCliente(page, `Config ${sufijo} SRL`, administrador);
      await page.getByRole("link", { name: "Usuarios", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
      // Sin paquetes, ningún producto está licenciado.
      await expect(
        page.getByRole("region", { name: "Usuarios licenciados" }).getByText("Sin licencia"),
      ).toHaveCount(4);

      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre y apellido").fill("Omar Operativo");
      await dialogo.getByLabel("Mail").fill(operativo);
      await expect(dialogo.getByRole("checkbox", { name: "Prodigal" })).toBeDisabled();
      await dialogo.getByRole("checkbox", { name: "Configuración" }).click();
      await capturar(page, "portal-usuario-nuevo");
      await dialogo.getByRole("button", { name: "Crear usuario" }).click();
      await expect(page.getByText(`Le enviamos a ${operativo} el acceso a STLic`)).toBeVisible();
      await expect(dialogo).toBeHidden();

      const fila = page.getByRole("row").filter({ hasText: operativo });
      await expect(fila.getByText("Acceso pendiente")).toBeVisible();
      await expect(fila.getByText("Configuración")).toBeVisible();
      // No puede darse de baja a sí mismo.
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: administrador })
          .getByRole("button", {
            name: /Dar de baja/,
          }),
      ).toHaveCount(0);
      await capturar(page, "portal-usuarios");
    });

    test("el invitado activa su acceso y solo ve la configuración", async ({ page }) => {
      await activarInvitacion(page, operativo);
      await expect(page).toHaveURL(/\/portal/);
      const menu = page.locator("[data-slot=sidebar]");
      await expect(menu.getByRole("link", { name: "Aseguradoras" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Productores" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Mis órdenes" })).toHaveCount(0);
      await expect(menu.getByRole("link", { name: "Paquetes disponibles" })).toHaveCount(0);
      // La protección no es solo del menú: la página también lo rechaza.
      await page.goto("/portal/ordenes");
      await expect(page.getByText("No tenés permiso para ver esto")).toBeVisible();

      // Un operativo no puede dar permisos de administración.
      await page.goto("/portal/usuarios");
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      await expect(
        page.getByRole("dialog").getByRole("checkbox", { name: "Administrador general" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
    });

    test("aseguradoras: trabajar con una y respetar la licencia de interfaces", async ({
      page,
    }) => {
      await ingresar(page, operativo, CONTRASENA);
      await page.goto("/portal/aseguradoras");
      await expect(page.getByText("Todavía no elegiste aseguradoras")).toBeVisible();

      // Se eligen varias del catálogo de una vez.
      await page.getByRole("button", { name: "Agregar aseguradoras" }).first().click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Buscar en el catálogo").fill("s");
      await dialogo.getByRole("checkbox", { name: /La Segunda/ }).click();
      await dialogo.getByRole("checkbox", { name: /Sancor Seguros/ }).click();
      await expect(dialogo.getByText("2 elegidas")).toBeVisible();
      await expect(dialogo.getByRole("checkbox", { name: /Interfaz con Prodigal/ })).toBeDisabled();
      await capturar(page, "portal-aseguradoras-agregar");
      await dialogo.getByRole("button", { name: "Agregar 2" }).click();
      await expect(page.getByText("Agregamos 2 aseguradoras.")).toBeVisible();

      const tarjeta = page.locator("[data-slot=card]").filter({ hasText: "La Segunda" });
      await expect(tarjeta.getByText("Trabajás con ella")).toBeVisible();
      await expect(
        page.locator("[data-slot=card]").filter({ hasText: "Sancor Seguros" }),
      ).toBeVisible();
      // Las que no eligió no aparecen en su lista.
      await expect(page.locator("[data-slot=card]").filter({ hasText: "Zurich" })).toHaveCount(0);

      // Sin interfaces licenciadas: se rechaza y el interruptor vuelve atrás.
      const interfaz = tarjeta.getByRole("switch", { name: "Interfaz con Prodigal" });
      await interfaz.click();
      await expect(page.getByText("Tu licencia no incluye interfaces de Prodigal.")).toBeVisible();
      await expect(interfaz).not.toBeChecked();
      await capturar(page, "portal-aseguradoras");
    });

    test("SOFTeam agrega una aseguradora al catálogo y la empresa la ve", async ({ page }) => {
      const nombre = `Aseguradora ${sufijo}`;
      const abreviatura = `E${sufijo}`.slice(0, 10).toUpperCase();
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/aseguradoras");
      await page.getByRole("button", { name: "Nueva aseguradora" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre").fill(nombre);
      await dialogo.getByLabel("Abreviatura").fill("con espacio");
      await dialogo.getByRole("checkbox", { name: "Interfaz con Prodigal" }).click();
      await dialogo.getByRole("button", { name: "Agregar aseguradora" }).click();
      await expect(dialogo.getByText("2 a 10 letras o números, sin espacios")).toBeVisible();
      // Se normaliza a mayúsculas.
      await dialogo.getByLabel("Abreviatura").fill(abreviatura.toLowerCase());
      await dialogo.getByRole("button", { name: "Agregar aseguradora" }).click();
      await expect(page.getByText(`${nombre} agregada al catálogo.`)).toBeVisible();
      const fila = page.getByRole("row").filter({ hasText: nombre });
      await expect(fila.getByText(abreviatura)).toBeVisible();
      await expect(fila.getByText("Prodigal")).toBeVisible();
      await capturar(page, "admin-aseguradoras");

      await page.context().clearCookies();
      await ingresar(page, operativo, CONTRASENA);
      await page.goto("/portal/aseguradoras");
      await page.getByRole("button", { name: "Agregar aseguradoras" }).click();
      await expect(
        page.getByRole("dialog").getByRole("checkbox", { name: new RegExp(nombre) }),
      ).toBeVisible();
    });

    test("productores: alta con validación y códigos por aseguradora", async ({ page }) => {
      await ingresar(page, operativo, CONTRASENA);
      await page.goto("/portal/productores");
      await page.getByRole("button", { name: "Nuevo productor" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre o razón social").fill("Gómez Seguros");
      await dialogo.getByLabel("Matrícula").fill("12345");
      await dialogo.getByLabel("CUIT").fill("20-12345678-5");
      await expect(dialogo.getByRole("checkbox", { name: "Agente institorio" })).toBeDisabled();
      await dialogo.getByRole("button", { name: "Crear productor" }).click();
      await expect(dialogo.getByText("El CUIT no es válido")).toBeVisible();
      // Lo tipeado se conserva al corregir.
      await expect(dialogo.getByLabel("Nombre o razón social")).toHaveValue("Gómez Seguros");
      await dialogo.getByLabel("CUIT").fill("20-12345678-6");
      await dialogo.getByRole("button", { name: "Crear productor" }).click();

      await expect(page.getByText("Productor creado. Ahora cargá sus códigos")).toBeVisible();
      await page.getByLabel("Aseguradora").selectOption({ label: "La Segunda" });
      await page.getByLabel("Código", { exact: true }).fill("ab-12");
      await page.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByText("Código AB-12 agregado.")).toBeVisible();
      await expect(page.getByRole("cell", { name: "AB-12", exact: true })).toBeVisible();
      await expect(page.getByLabel("Código", { exact: true })).toHaveValue("");
      await capturar(page, "portal-productor");

      await page.getByRole("button", { name: "Quitar el código AB-12 de La Segunda" }).click();
      await expect(page.getByRole("cell", { name: "AB-12", exact: true })).toHaveCount(0);
    });

    test("políticas de la empresa", async ({ page }) => {
      await ingresar(page, operativo, CONTRASENA);
      await page.goto("/portal/politicas");
      await page.getByRole("checkbox", { name: "Sin tope" }).click();
      await expect(page.getByLabel("Tope mensual por oficina")).toBeDisabled();
      await page.getByRole("checkbox", { name: /Las oficinas con administrador propio/ }).click();
      await page.getByRole("button", { name: "Guardar políticas" }).click();
      await expect(page.getByText("Políticas guardadas.")).toBeVisible();
      await page.reload();
      await expect(page.getByRole("checkbox", { name: "Sin tope" })).toBeChecked();
      await expect(
        page.getByRole("checkbox", { name: /Las oficinas con administrador propio/ }),
      ).not.toBeChecked();
    });

    test("olvidé mi contraseña", async ({ page }) => {
      await page.goto("/ingresar");
      await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
      await expect(page.getByRole("heading", { name: "¿Olvidaste tu contraseña?" })).toBeVisible();
      await page.getByLabel("Mail").fill(administrador);
      await page.getByRole("button", { name: "Enviarme el código" }).click();
      await expect(page).toHaveURL(/\/recuperar\/cambiar/);
      await page.getByLabel("Código", { exact: true }).fill("000000");
      await page.getByLabel("Contraseña nueva").fill(nuevaContrasena);
      await page.getByLabel("Repetí la contraseña").fill(nuevaContrasena);
      await page.getByRole("button", { name: "Guardar contraseña" }).click();
      await expect(page.getByText("El código no es correcto.")).toBeVisible();

      await page.getByLabel("Código", { exact: true }).fill(await codigoEnviadoA(administrador));
      await page.getByLabel("Contraseña nueva").fill(nuevaContrasena);
      await page.getByLabel("Repetí la contraseña").fill(nuevaContrasena);
      await page.getByRole("button", { name: "Guardar contraseña" }).click();
      await expect(page.getByText("Listo, guardamos tu contraseña")).toBeVisible();
      await page.getByLabel("Contraseña", { exact: true }).fill(nuevaContrasena);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await expect(page).toHaveURL(/\/portal/);
    });

    test("SOFTeam: auditoría y usuarios con roles", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.getByRole("link", { name: "Auditoría" }).click();
      await page.getByLabel("Tipo de registro").selectOption("productor");
      await page.getByRole("button", { name: "Filtrar" }).click();
      await expect(page.getByText("Alta de código").first()).toBeVisible();
      await page.getByText("Alta de código").first().click();
      await expect(page.locator("details[open]").getByText('"codigo": "AB-12"')).toBeVisible();
      await capturar(page, "admin-auditoria");

      await page.getByRole("link", { name: "Usuarios SOFTeam" }).click();
      await page.getByRole("button", { name: "Invitar usuario" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo.getByLabel("Nombre y apellido").fill("Sofía Soporte");
      await dialogo.getByLabel("Mail").fill(soporte);
      await dialogo.getByLabel("Rol").selectOption("SOPORTE");
      await dialogo.getByRole("button", { name: "Enviar invitación" }).click();
      await expect(page.getByText(`Invitamos a ${soporte}.`)).toBeVisible();
      const fila = page.getByRole("table").getByRole("row").filter({ hasText: soporte });
      await expect(fila.getByText("Invitación pendiente")).toBeVisible();
      await capturar(page, "admin-usuarios");

      // Un mail que administra un cliente no puede ser de SOFTeam.
      await page.getByRole("button", { name: "Invitar usuario" }).click();
      await dialogo.getByLabel("Nombre y apellido").fill("Cliente");
      await dialogo.getByLabel("Mail").fill(administrador);
      await dialogo.getByRole("button", { name: "Enviar invitación" }).click();
      await expect(dialogo.getByText("Ese mail administra una cuenta de cliente")).toBeVisible();
      await page.keyboard.press("Escape");
    });

    test("soporte ve solo lo suyo y pierde el acceso en el acto", async ({ page, browser }) => {
      await activarInvitacion(page, soporte);
      await expect(page).toHaveURL(/\/admin/);
      const menu = page.locator("[data-slot=sidebar]");
      await expect(menu.getByRole("link", { name: "Auditoría" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Usuarios SOFTeam" })).toHaveCount(0);
      await page.goto("/admin/usuarios");
      await expect(page.getByText("No tenés permiso para ver esto")).toBeVisible();

      // Administración le quita el acceso desde otra sesión.
      const otra = await browser.newContext();
      const admin = await otra.newPage();
      await ingresar(admin, ADMIN.email, ADMIN.contrasena);
      await admin.goto("/admin/usuarios");
      const fila = admin.getByRole("table").getByRole("row").filter({ hasText: soporte });
      await expect(fila.getByText("Último ingreso")).toBeVisible();
      await fila.getByRole("button", { name: "Quitar acceso" }).click();
      await admin.getByRole("button", { name: /Quitar acceso a Sofía Soporte/ }).click();
      await expect(admin.getByText("Quitamos el acceso y cerramos sus sesiones.")).toBeVisible();
      await otra.close();

      await page.goto("/admin");
      await expect(page).toHaveURL(/\/(ingresar|sin-acceso)/);
    });
  });
