import {
  activarInvitacion,
  CONTRASENA,
  capturar,
  expect,
  ingresar,
  registrarCliente,
  test,
} from "./utilidades";

const sufijo = `d${Date.now().toString(36)}`;
const general = `general.${sufijo}@brokerdelsur.com.ar`;
const delegado = `delegado.${sufijo}@brokerdelsur.com.ar`;
const vecino = `vecino.${sufijo}@brokerdelsur.com.ar`;
const canalero = `canal.${sufijo}@brokerdelsur.com.ar`;

test.describe
  .serial("administradores delegados por oficina", () => {
    test("el administrador general crea una oficina y le asigna un administrador", async ({
      page,
    }) => {
      await registrarCliente(page, `Delegados ${sufijo} SRL`, general);
      await page.goto("/portal/oficinas");
      await page.getByRole("button", { name: "Nueva oficina" }).click();
      await page.getByRole("dialog").getByLabel("Nombre de la oficina").fill("Sucursal Rosario");
      await page.getByRole("dialog").getByRole("button", { name: "Crear oficina" }).click();
      await expect(page.getByText(/Oficina 01-002 creada/)).toBeVisible();

      await page.goto("/portal/usuarios");
      for (const [email, oficina] of [
        [delegado, "Oficina 01-002"],
        [vecino, "Oficina 01-001"],
        [canalero, "Canal 01"],
      ] as const) {
        await page.getByRole("button", { name: "Nuevo usuario" }).click();
        const dialogo = page.getByRole("dialog");
        await dialogo.getByLabel("Nombre y apellido").fill(`Usuario ${oficina}`);
        await dialogo.getByLabel("Mail").fill(email);
        const alcance = dialogo.getByLabel("Qué puede ver");
        const valor = await alcance.locator("option", { hasText: oficina }).getAttribute("value");
        await alcance.selectOption(valor ?? "");
        if (email !== vecino) {
          await dialogo.getByRole("checkbox", { name: "Paquetes y pagos" }).click();
        }
        if (email === delegado) {
          await dialogo.getByRole("checkbox", { name: "Configuración" }).click();
        }
        await dialogo.getByRole("button", { name: "Crear usuario" }).click();
        await expect(dialogo).toBeHidden();
      }
      await expect(page.getByRole("row").filter({ hasText: delegado })).toContainText(
        "Oficina 01-002 · Sucursal Rosario",
      );
    });

    test("el delegado solo ve su oficina y lo que es de ella", async ({ page }) => {
      await activarInvitacion(page, delegado);
      await expect(page).toHaveURL(/\/portal/);
      await expect(page.getByText("Oficina 01-002 · Sucursal Rosario").first()).toBeVisible();

      // Lo que es de toda la empresa no aparece ni se puede abrir.
      const menu = page.locator("[data-slot=sidebar]");
      await expect(menu.getByRole("link", { name: "Usuarios" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Productores" })).toBeVisible();
      for (const opcion of ["Aseguradoras", "Políticas", "Marca"]) {
        await expect(menu.getByRole("link", { name: opcion, exact: true })).toHaveCount(0);
      }
      await page.goto("/portal/politicas");
      await expect(page.getByText("No tenés permiso para ver esto")).toBeVisible();

      // Usuarios: solo los de su oficina.
      await page.goto("/portal/usuarios");
      await expect(page.getByRole("row").filter({ hasText: delegado })).toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: vecino })).toHaveCount(0);
      await expect(page.getByRole("row").filter({ hasText: general })).toHaveCount(0);
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      await expect(
        page.getByRole("dialog").getByLabel("Qué puede ver").locator("option"),
      ).toHaveText(["Oficina 01-002 · Sucursal Rosario"]);
      await page.keyboard.press("Escape");
      await capturar(page, "portal-delegado-usuarios");

      await page.goto("/portal/oficinas");
      await expect(page.getByText("Sucursal Rosario", { exact: true })).toBeVisible();
      await expect(page.getByText("Casa central", { exact: true })).toHaveCount(0);
    });

    test("compra delegada: los paquetes quedan asignados a la oficina", async ({ page }) => {
      await ingresar(page, delegado, CONTRASENA);
      await page.goto("/portal/paquetes");
      await page
        .getByRole("button", { name: "Agregar Prodigal Inicial · Mensual al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();
      await page.goto("/portal/carrito");
      await expect(page.getByText(/Compra para Oficina 01-002 · Sucursal Rosario/)).toBeVisible();
      await page.getByRole("checkbox", { name: /Revisé los paquetes/ }).click();
      await page.getByRole("button", { name: "Confirmar orden" }).click();
      await expect(page.getByText("¡Orden confirmada!")).toBeVisible();

      // El general ve la orden de la oficina y su carrito sigue vacío.
      await page.context().clearCookies();
      await ingresar(page, general, CONTRASENA);
      await page.goto("/portal/ordenes");
      await expect(page.locator('a[href^="/portal/ordenes/"]:not([href*="exportar"])')).toHaveCount(
        1,
      );
      await expect(page.getByRole("link", { name: "Carrito vacío" })).toBeVisible();
    });

    test("un delegado de canal elige para qué oficina compra", async ({ page }) => {
      await activarInvitacion(page, canalero);
      await page.goto("/portal/paquetes");
      const selector = page.getByLabel("Comprar para");
      await expect(selector.locator("option")).toHaveText([
        "Oficina 01-001 · Casa central",
        "Oficina 01-002 · Sucursal Rosario",
      ]);
      await selector.selectOption({ label: "Oficina 01-002 · Sucursal Rosario" });
      await expect(
        page.getByText(/queda asignado a Oficina 01-002 · Sucursal Rosario/),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Agregar Prodigal Inicial · Mensual al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();

      await page.goto("/portal/carrito");
      await expect(page.getByText(/Compra para Oficina 01-002 · Sucursal Rosario/)).toBeVisible();
      await expect(page.getByText("Prodigal Inicial", { exact: true })).toBeVisible();
      await capturar(page, "portal-delegado-canal-carrito");

      // Otra oficina, otro carrito.
      await page
        .getByLabel("Comprar para")
        .selectOption({ label: "Oficina 01-001 · Casa central" });
      await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
    });
  });
