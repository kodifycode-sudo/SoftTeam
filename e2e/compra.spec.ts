import {
  ADMIN,
  CONTRASENA,
  capturar,
  expect,
  ingresar,
  registrarCliente,
  test,
} from "./utilidades";

const sufijo = `C${Date.now().toString(36).toUpperCase()}`;
const email = `compras.${sufijo.toLowerCase()}@brokerdelsur.com.ar`;
const razonSocial = `Seguros ${sufijo} SRL`;
let numeroOrden = "";

test.describe
  .serial("compra de paquetes", () => {
    test("el cliente arma el carrito y confirma la orden", async ({ page }) => {
      await registrarCliente(page, razonSocial, email);

      await page.goto("/portal/paquetes");
      await page
        .getByRole("button", { name: "Agregar Prodigal Inicial · Trimestral inicial al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Carrito: 1 unidades" })).toBeVisible();

      await page.goto("/portal/paquetes?tipo=CONSUMIBLE");
      await page
        .getByRole("button", { name: "Agregar Notificaciones 10.000 · Pago único al carrito" })
        .click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();

      await page.goto("/portal/carrito");
      await expect(page.getByText("Prodigal Inicial", { exact: true })).toBeVisible();
      // El primer alta es un trimestre.
      await expect(page.getByText(/Tu primer alta es por un trimestre/)).toBeVisible();
      await expect(page.getByRole("list", { name: "Día de vencimiento" })).toHaveCount(0);
      // Medio sin ajuste, para verificar el cálculo: 2 × 114.000 + 30.000 = 258.000 + 21 % IVA.
      await page.getByRole("link", { name: /Link de pago/ }).click();
      await expect(page.getByRole("link", { name: /Link de pago/ })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await page.getByRole("button", { name: "Una unidad más" }).first().click();
      await expect(page.getByText("$ 312.180,00").first()).toBeVisible();
      await capturar(page, "20-carrito");

      // Un código inexistente se rechaza con un mensaje genérico y no rompe el total.
      await page.getByLabel("Código de descuento").fill("NOEXISTE");
      await page.getByRole("button", { name: "Aplicar" }).click();
      await expect(
        page.getByText("El código no es válido o no aplica a esta orden."),
      ).toBeVisible();

      // Pago directo (modo 0, el del alta web): la transferencia es de la factura adelantada.
      await expect(page.getByRole("link", { name: /Transferencia bancaria/ })).toHaveCount(0);
      await expect(page.getByText(/Pagás con Link de pago/)).toBeVisible();
      await page.getByRole("checkbox", { name: /Revisé los paquetes/ }).click();
      await page.getByRole("button", { name: "Confirmar orden" }).click();

      await expect(page).toHaveURL(/\/portal\/ordenes\/[0-9a-f-]{36}\?nueva=1/);
      await expect(page.getByText("¡Orden confirmada!")).toBeVisible();
      await expect(page.getByText("Pendiente de pago")).toBeVisible();
      numeroOrden =
        (await page.getByRole("heading", { level: 1 }).textContent())?.replace(/\D/g, "") ?? "";
      expect(numeroOrden).not.toBe("");
      await capturar(page, "21-orden-confirmada");

      // El carrito quedó vacío.
      await expect(page.getByRole("link", { name: "Carrito vacío" })).toBeVisible();
    });

    test("SOFTeam registra el pago", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/ordenes");
      await capturar(page, "22-admin-ordenes");
      await page
        .getByRole("link", { name: `#${numeroOrden}` })
        .first()
        .click();

      // Bonificación de un paquete: la orden se recalcula; con 0 % se quita.
      // (El ajuste del medio de pago depende de la base: se compara contra el total original.)
      const total = page
        .locator("dt", { hasText: /^Total$/ })
        .locator("xpath=following-sibling::dd[1]");
      const totalOriginal = await total.textContent();
      await page.getByRole("button", { name: "Bonificar un paquete" }).click();
      const dialogo = page.getByRole("dialog");
      await dialogo
        .getByLabel("Paquete")
        .selectOption({ label: "Prodigal Inicial · Trimestral inicial ×2" });
      await dialogo.getByLabel("Bonificación (%)").fill("10");
      await dialogo.getByRole("button", { name: "Aplicar y recalcular" }).click();
      await expect(dialogo.getByText("Contá el motivo (queda en la auditoría).")).toBeVisible();
      await dialogo.getByLabel("Motivo").fill("Cliente de muchos años");
      await dialogo.getByRole("button", { name: "Aplicar y recalcular" }).click();
      await expect(page.getByText("Bonificación aplicada: la orden se recalculó.")).toBeVisible();
      // 10 % de 228.000 (dos Prodigal Inicial) = 22.800 de bonificación.
      await expect(page.getByText("− $ 22.800,00").first()).toBeVisible();
      await expect(total).not.toHaveText(totalOriginal ?? "");
      await capturar(page, "22b-admin-orden-bonificada");

      await page.getByRole("button", { name: "Bonificar un paquete" }).click();
      await page
        .getByRole("dialog")
        .getByLabel("Paquete")
        .selectOption({ label: "Prodigal Inicial · Trimestral inicial ×2" });
      await page.getByRole("dialog").getByLabel("Bonificación (%)").fill("0");
      await page.getByRole("dialog").getByLabel("Motivo").fill("Se quita la prueba");
      await page.getByRole("dialog").getByRole("button", { name: "Aplicar y recalcular" }).click();
      await expect(total).toHaveText(totalOriginal ?? "");
      await expect(page.getByText("− $ 22.800,00")).toHaveCount(0);

      await page.getByRole("button", { name: "Registrar pago" }).click();
      await page.getByRole("button", { name: "Sí, registrar pago" }).click();
      await expect(page.getByText("Pago registrado: 2 paquetes activados.")).toBeVisible();
      await expect(page.getByText("Pagada", { exact: true })).toBeVisible();
      await capturar(page, "23-admin-orden-pagada");

      // Recibo provisorio: constancia del pago hasta que se emite la factura.
      await page.getByRole("link", { name: "Ver recibo provisorio" }).click();
      await expect(page.getByRole("heading", { name: "Recibo provisorio" })).toBeVisible();
      await expect(page.getByText(`R-${numeroOrden}`)).toBeVisible();
      await expect(page.getByText("Documento no válido como factura.")).toBeVisible();
      await capturar(page, "23b-recibo-provisorio");
    });

    test("el cliente ve su licencia activa", async ({ page }) => {
      await ingresar(page, email, CONTRASENA);
      await expect(page.getByRole("heading", { name: "Tu licencia hoy" })).toBeVisible();
      await expect(page.getByText("Prodigal · Gestión")).toBeVisible();
      await expect(page.getByText("10.000").first()).toBeVisible();
      await capturar(page, "24-portal-licencia");
      await page.goto("/portal/ordenes");
      await expect(page.getByText("Pagada").first()).toBeVisible();
    });

    test("el trimestre inicial no se renueva solo: se negocia con SOFTeam", async ({ page }) => {
      await ingresar(page, email, CONTRASENA);
      await expect(
        page.getByText("Trimestre inicial: antes del vencimiento acordamos con vos cómo seguir."),
      ).toBeVisible();
      await expect(
        page.getByRole("switch", { name: "Renovación automática de Prodigal Inicial" }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Renovar Prodigal Inicial" })).toHaveCount(0);

      // Ya tiene paquetes: lo siguiente se contrata mensual o anual, con el tramo
      // proporcional hasta el vencimiento del trimestre.
      await page.goto("/portal/paquetes");
      await expect(
        page.getByRole("button", {
          name: "Agregar Prodigal Inicial · Trimestral inicial al carrito",
        }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Agregar CotiWeb Pro · Mensual al carrito" }).click();
      await expect(page.getByText("Agregado al carrito.")).toBeVisible();
      await page.goto("/portal/carrito");
      await expect(page.getByText(/días proporcionales: vence el/)).toBeVisible();
      await capturar(page, "25-portal-adicional-con-tramo");
      await page.getByRole("button", { name: "Una unidad menos" }).click();
      await expect(page.getByText("Tu carrito está vacío")).toBeVisible();
    });

    test("SOFTeam ve las cajas del tablero y la grilla para negociar", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await expect(page.getByRole("heading", { name: "Para atender" })).toBeVisible();
      await page.getByRole("link", { name: /Renovaciones a negociar/ }).click();
      await expect(page.getByRole("heading", { name: "Para negociar" })).toBeVisible();
      await expect(page.getByText("Altas a grupo pendientes")).toBeVisible();
      await capturar(page, "admin-para-negociar");
    });
  });

test.describe
  .serial("baja de un paquete por SOFTeam", () => {
    test("Administración da de baja un paquete activo con motivo", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto(`/admin/clientes?q=${encodeURIComponent(razonSocial)}`);
      await page.getByRole("link", { name: razonSocial }).first().click();

      // El libro de movimientos del paquete de notificaciones: la carga al pagar.
      await page.getByRole("link", { name: "Movimientos de Notificaciones 10.000" }).click();
      await expect(page.getByRole("heading", { name: /Notificaciones 10.000/ })).toBeVisible();
      await expect(page.getByRole("cell", { name: "+10.000" })).toBeVisible();
      await expect(page.getByText("Saldo actual")).toBeVisible();
      await capturar(page, "admin-movimientos-contrato");
      await page.goBack();

      await page.getByRole("button", { name: "Dar de baja Notificaciones 10.000" }).click();
      await page
        .getByRole("dialog")
        .getByLabel("Motivo")
        .fill("El cliente ya no envía notificaciones");
      await page.getByRole("dialog").getByRole("button", { name: "Dar de baja" }).click();
      await expect(page.getByText("Paquete dado de baja.")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Dar de baja Notificaciones 10.000" }),
      ).toHaveCount(0);
    });
  });

test.describe
  .serial("orden manual de SOFTeam", () => {
    test("Administración carga un consumible bonificado al 100 % con su saldo", async ({
      page,
    }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto(`/admin/clientes?q=${encodeURIComponent(razonSocial)}`);
      await page.getByRole("link", { name: razonSocial }).first().click();
      await page.getByRole("link", { name: "Orden manual" }).click();
      await expect(page.getByRole("heading", { name: "Orden manual" })).toBeVisible();

      await page
        .getByLabel("Paquete a agregar")
        .selectOption({ label: "Notificaciones 10.000 · Pago único · $ 30.000,00" });
      await page.getByRole("button", { name: "Agregar" }).click();
      await page.getByLabel("Bonificación (%)").fill("100");
      await page.getByLabel("Motivo").fill("Reclamo por envíos demorados");
      await page.getByLabel("Unidades de saldo").fill("2500");
      await page.getByRole("button", { name: "Calcular" }).click();
      await expect(page.getByText(/Sin importe: queda pagada en el acto/)).toBeVisible();
      await capturar(page, "admin-orden-manual");
      await page.getByRole("button", { name: "Confirmar" }).click();

      await expect(page).toHaveURL(/\/admin\/ordenes\/[0-9a-f-]{36}/);
      await expect(page.getByText("Pagada", { exact: true })).toBeVisible();
    });
  });
