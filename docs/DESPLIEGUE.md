# Despliegue en Vercel y Neon

Guía para poner STLic en producción. Arquitectura:

| Pieza | Servicio | Para qué |
|---|---|---|
| Aplicación | **Vercel** | Next.js (páginas, API, webhooks, cron) |
| Base de datos | **Neon** | Postgres. La app usa la conexión con pooler; las migraciones, la directa |
| Mails | **Resend** | Códigos de verificación, invitaciones, avisos |
| Cobro (opcional) | **Mercado Pago** | Link de pago y notificaciones de pago |
| Procesos | **Vercel Cron** | Renovación, alertas, recordatorios y facturación, una vez por día |

> Nada de esto requiere servidores propios. Los planes gratuitos alcanzan para
> empezar; el plan Pro de Vercel solo hace falta para reintentar los webhooks
> cada pocos minutos (ver "Procesos programados").

---

## 1. Subir el código a un repositorio

Vercel despliega desde GitHub (o GitLab/Bitbucket). Crear un repositorio
**privado** y subir la rama principal:

```bash
git remote add origin git@github.com:softeam/stlic.git
git push -u origin master
```

Cada push a la rama principal publica producción; cada rama o pull request
genera un despliegue de vista previa con su propia URL.

## 2. Crear el proyecto en Vercel

1. En Vercel: **Add New → Project** e importar el repositorio. Detecta Next.js.
2. No cambiar el comando de build: el proyecto define `vercel-build`, que
   Vercel ejecuta automáticamente y hace dos cosas:
   `npm run db:migrate` (migraciones + datos base) y `next build`.
3. Todavía no desplegar: primero la base y las variables (pasos 3 y 4).

## 3. Crear la base en Neon

1. En el proyecto de Vercel: **Storage → Create Database → Neon** (integración
   nativa). Elegir la región **São Paulo (aws-sa-east-1)**.
2. Conectarla al proyecto para *Production* y *Preview*. La integración crea
   solas las variables `DATABASE_URL` (con pooler) y `DATABASE_URL_UNPOOLED`
   (directa).
3. Activar **ramas por despliegue de vista previa** (preview branching): cada
   vista previa tiene su propia copia de la base y no toca los datos reales.
4. En Vercel, **Settings → Functions → Function Region**: elegir **São Paulo
   (gru1)**, la misma región que la base (cada consulta cruza menos distancia).

## 4. Variables de entorno

En **Settings → Environment Variables**. Generar los secretos con:

```bash
openssl rand -base64 32   # para BETTER_AUTH_SECRET y STLIC_CLAVE_MAESTRA
openssl rand -hex 32      # para CRON_SECRET
```

| Variable | Obligatoria | Valor |
|---|---|---|
| `DATABASE_URL` | Sí (la crea Neon) | Conexión con pooler |
| `DATABASE_URL_UNPOOLED` | Sí (la crea Neon) | Conexión directa, para las migraciones |
| `BETTER_AUTH_URL` | Sí en producción | URL pública, p. ej. `https://stlic.softeam.com.ar`. En las vistas previas se toma sola |
| `BETTER_AUTH_SECRET` | Sí | Secreto de las sesiones (32 bytes o más) |
| `STLIC_CLAVE_MAESTRA` | Sí | 32 bytes en base64. Cifra los secretos de los sistemas integrados. **No cambiarla nunca** (ver "Seguridad") |
| `CRON_SECRET` | Sí | Vercel lo envía solo al llamar al cron |
| `RESEND_API_KEY` | Sí | Clave de Resend |
| `EMAIL_REMITENTE` | Recomendada | `STLic <no-responder@softeam.com.ar>` (dominio verificado en Resend) |
| `ADMIN_EMAIL` | Primer despliegue | Mail real de quien administra SOFTeam |
| `ADMIN_PASSWORD` | Primer despliegue | Contraseña inicial (se quita después, ver paso 6) |
| `MERCADOPAGO_ACCESS_TOKEN` | No | Token de producción de Mercado Pago |
| `MERCADOPAGO_WEBHOOK_SECRET` | Con el token | Clave secreta de las notificaciones |
| `XUBIO_CLIENT_ID` / `XUBIO_SECRET_ID` | Para facturar | Credenciales de la API de Xubio (ver "Facturación con Xubio") |
| `XUBIO_PUNTO_VENTA_ID` / `XUBIO_PRODUCTO_ID` | Con las credenciales | Punto de venta electrónico y producto de las facturas |
| `XUBIO_CENTRO_COSTO_ID` | No | Centro de costo, si la cuenta los usa |
| `STLIC_EMISOR_CUIT` | Recomendada | CUIT de SOFTeam (11 dígitos), para el recibo provisorio |
| `STLIC_EMISOR_DOMICILIO` | No | Domicilio de SOFTeam que se imprime en el recibo |
| `DATABASE_POOL_MAX` | No | Conexiones por instancia (por defecto 5) |
| `STLIC_AMBIENTE` | No | `pruebas` en un despliegue para probar: no exige Resend (los mails quedan en los logs de Vercel). En producción real, no definirla |
| `STLIC_CATALOGO_DEMO` | No | `1` **solo en vista previa**: carga paquetes de ejemplo |

Si falta una variable obligatoria, la app no arranca y el error dice cuál.

## 5. Mails con Resend

1. En Resend: **Domains → Add Domain** (`softeam.com.ar`).
2. Cargar en el DNS los registros que indica (SPF, DKIM y, recomendado, DMARC).
3. Crear una API key con permiso de envío y cargarla en `RESEND_API_KEY`.

Sin el dominio verificado, los mails no salen o caen en spam.

## 6. Primer despliegue

1. **Deploy**. En el log del build se ve:

   ```
   [migrar] aplicando migraciones…
   [migrar] cargando datos base…
   [migrar] listo.
   ```

   Los datos base son el país, los productos y sus recursos, los medios de
   pago, los parámetros, las aseguradoras (sin interfaces habilitadas) y el
   usuario de Administración. **No** se cargan paquetes de ejemplo.
2. Entrar con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
3. Cambiar la contraseña: salir, **¿Olvidaste tu contraseña?**, recibir el
   código y elegir una nueva.
4. Borrar `ADMIN_PASSWORD` de las variables de Vercel.
5. Activar la verificación en dos pasos: *menú de usuario → Seguridad de la
   cuenta*. Recomendado para todo el equipo de SOFTeam; si alguien pierde el
   celular y los códigos de respaldo, Administración se la quita desde
   *Usuarios SOFTeam*.

Correr la migración de nuevo es seguro: todo es idempotente.

## 7. Dominio propio

1. **Settings → Domains → Add**: `stlic.softeam.com.ar`.
2. En el DNS: registro `CNAME stlic → cname.vercel-dns.com`. Vercel emite el
   certificado HTTPS solo.
3. Poner `BETTER_AUTH_URL=https://stlic.softeam.com.ar` y volver a desplegar.

## 8. Procesos programados

`vercel.json` ya programa **`/api/cron/procesos` todos los días a las 06:00
de Argentina** (09:00 UTC): renovación quincenal, alertas, excepciones de pago,
recordatorios de cobro, envío de avisos por mail y facturas pendientes. Es
idempotente: correrlo de más no duplica nada, y también se puede ejecutar desde
*Panel SOFTeam → Procesos y alertas*.

Los avisos a los productos (webhooks) salen en el momento de cada cambio. Si un
producto no responde, se reintentan con `/api/cron/eventos`:

- **Vercel Pro**: agregar en `vercel.json`
  `{ "path": "/api/cron/eventos", "schedule": "*/5 * * * *" }`.
- **Plan gratuito**: los crons son diarios. Usar un planificador externo (por
  ejemplo cron-job.org) que llame cada 5 minutos a
  `https://<dominio>/api/cron/eventos` con la cabecera
  `Authorization: Bearer <CRON_SECRET>`.

## 9. Mercado Pago

1. En el panel de desarrolladores de Mercado Pago, crear una aplicación
   (Checkout Pro).
2. **Probar primero** con credenciales de prueba y usuarios de prueba, en un
   despliegue de vista previa.
3. **Webhooks**: URL `https://<dominio>/api/pagos/aviso`, evento **Pagos**.
   Copiar la *clave secreta* en `MERCADOPAGO_WEBHOOK_SECRET`.
4. Cargar el *access token* de producción en `MERCADOPAGO_ACCESS_TOKEN`.

Sin estas variables, en producción el botón "Pagar ahora" no aparece (el
simulador de pagos solo existe fuera de producción).

### Facturación con Xubio

1. En Xubio: *Configuración → Integraciones → API*, generar el **Client ID** y
   el **Secret ID** (`XUBIO_CLIENT_ID`, `XUBIO_SECRET_ID`).
2. Anotar el **id del punto de venta electrónico** con el que se factura
   (`XUBIO_PUNTO_VENTA_ID`) y crear un **producto o servicio** "Licencias
   STLic" con IVA 21 % (su id en `XUBIO_PRODUCTO_ID`). Si la cuenta usa
   centros de costo, `XUBIO_CENTRO_COSTO_ID`.
3. **Probar primero** en una vista previa, con una orden real chica: el
   adaptador se armó sobre la documentación pública de la API 1.1 y todavía
   no se probó contra una cuenta. Verificar en Xubio el cliente, los importes,
   el IVA y el CAE.

STLic busca el cliente por el "Código en Xubio" de su ficha; si no está, por
CUIT, y si no existe lo crea. Cada factura lleva `externalId = stlic-<orden>`:
un reintento no emite dos veces. Sin estas variables, en producción las
órdenes pagadas quedan "pendientes de facturar" y el proceso diario las
factura cuando se configura.

### Ambiente de pruebas con datos de demostración

Para un despliegue de pruebas (nunca producción real): `STLIC_AMBIENTE=pruebas`
y cargar la demo en su base con la conexión directa, confirmándolo:

```bash
DATABASE_URL_UNPOOLED=<conexión directa> STLIC_DEMO_REMOTO=si npm run db:demo
```

Los usuarios y la contraseña están en `docs/DEMO.md`.

## 10. Antes de abrir a los clientes

- **Paquetes**: crearlos en *Panel SOFTeam → Paquetes* (producción arranca sin
  catálogo).
- **Medios de pago**: revisar ajustes y habilitaciones. El débito automático
  todavía no está implementado: dejarlo deshabilitado.
- **Aseguradoras**: se cargan sin interfaces disponibles, porque la
  disponibilidad real la define SOFTeam. Marcarlas en *Panel SOFTeam →
  Aseguradoras* (rol Administración), donde también se agregan compañías
  nuevas y se discontinúan las que dejan de operar.

- **Facturación de oficinas a otro cliente**: por defecto solo la asigna SOFTeam
  desde la ficha del cliente. Para que las empresas puedan pedirla desde el
  portal (decisión pendiente, ver ESPECIFICACION 4.3), activarlo en *Panel
  SOFTeam → Parámetros*.

- **Sistemas integrados**: dar de alta Prodigal, CotiWeb, BienSeguro y el
  Boletín en *Integraciones* y entregar a cada equipo su secreto.
- **Facturación**: el adaptador de Xubio está pendiente. Hasta conectarlo, las
  órdenes pagadas quedan "pendientes de facturar" y se emiten solas cuando se
  conecte.

## 11. Operación

- **Cambios en la base**: generar la migración en desarrollo
  (`npm run db:generate`), revisarla y commitearla. El próximo despliegue la
  aplica antes de publicar el código nuevo.
- **Volver atrás**: Vercel permite volver a un despliegue anterior en un clic,
  pero **las migraciones no se deshacen**. Diseñarlas compatibles hacia atrás
  (agregar columnas antes de usarlas; borrar después).
- **Respaldo**: Neon guarda el historial de cambios (restauración a un momento
  dado dentro del período de retención del plan). Para un respaldo externo:
  `pg_dump "$DATABASE_URL_UNPOOLED" > stlic.sql`.
- **Monitoreo**: *Procesos y alertas* muestra cada corrida y sus errores;
  *Integraciones*, los avisos fallidos; los logs de Vercel, el resto.

## 12. Seguridad

- **`STLIC_CLAVE_MAESTRA`**: con ella se cifran los secretos de los sistemas
  integrados. Si se cambia, esos secretos ya no se pueden leer y hay que
  rotarlos todos desde *Integraciones*. Guardarla en un gestor de secretos.
- **`BETTER_AUTH_SECRET`**: cambiarla cierra todas las sesiones.
- **`CRON_SECRET`**: si se filtra, cambiarla en Vercel y volver a desplegar.
- Los secretos solo viven en las variables de Vercel: nunca en el repositorio.
