import { ADMIN, capturar, expect, ingresar, test } from "./utilidades";

const sufijo = Date.now().toString(36).toUpperCase().slice(-6);

test.describe
  .serial("importación de datos", () => {
    test("revisa el archivo y después lo importa", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/importar?tipo=aseguradoras");
      await expect(
        page.getByText("Catálogo de aseguradoras", { exact: true }).last(),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Descargar plantilla" })).toBeVisible();

      const archivo = {
        name: "aseguradoras.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          `AseguradoraId;AseguradoraNom;AseguradoraAbrev;AseguradoraInterfaseProdiCarteraSino;Color\nE${sufijo};Importada ${sufijo};I${sufijo};S;rojo\n`,
        ),
      };
      await page.getByLabel("Archivo (.csv o .txt)").setInputFiles(archivo);
      await page.getByRole("button", { name: "Revisar" }).click();
      await expect(page.getByText("Revisión sin errores: todavía no se guardó nada")).toBeVisible();
      await expect(page.getByText("Se ignoran: Color.")).toBeVisible();
      await capturar(page, "admin-importar-revision");

      await page.getByLabel("Archivo (.csv o .txt)").setInputFiles(archivo);
      await page.getByRole("button", { name: "Importar" }).click();
      await expect(page.getByText("Importación terminada")).toBeVisible();

      await page.goto("/admin/aseguradoras");
      await expect(page.getByRole("row").filter({ hasText: `Importada ${sufijo}` })).toBeVisible();
    });

    test("un archivo con errores muestra cada línea y no importa nada", async ({ page }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/importar?tipo=clientes");
      await page.getByLabel("Archivo (.csv o .txt)").setInputFiles({
        name: "clientes.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "CUIT;Nombre o razón social;Condición de IVA;Domicilio fiscal;Localidad;Código postal;Provincia;Administrador;Mail del administrador\n20-12345678-5;Malo SA;RI;Calle 1;Rosario;2000;Santa Fe;Ana;ana@test.com\n",
        ),
      });
      await page.getByRole("button", { name: "Importar" }).click();
      await expect(page.getByText("1 fila con errores: no se importó nada")).toBeVisible();
      await expect(
        page.getByRole("table", { name: "Errores por fila" }).getByText('CUIT: "20-12345678-5"'),
      ).toBeVisible();
    });

    test("el manual explica el formato y cómo exportar; un archivo con comas se rechaza", async ({
      page,
    }) => {
      await ingresar(page, ADMIN.email, ADMIN.contrasena);
      await page.goto("/admin/importar?tipo=usuarios");
      await expect(page.getByText("Cómo preparar el archivo")).toBeVisible();
      await expect(page.getByText("Cómo exportarlo de SOFTeam")).toBeVisible();
      await expect(page.getByText("SELECT * FROM STLicUsuarios").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Copiar el comando" })).toBeVisible();
      await capturar(page, "admin-importar-manual");

      await page.getByLabel("Archivo (.csv o .txt)").setInputFiles({
        name: "usuarios.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "STLicEmpresaCod,StLicUsuarioNom,StLicUsuarioMail\n2001,Ana,ana@test.com\n",
        ),
      });
      await page.getByRole("button", { name: "Revisar" }).click();
      await expect(
        page.getByText(/separados por punto y coma \(;\) y este archivo usa comas/),
      ).toBeVisible();
    });
  });
