# STLic

Plataforma de cuentas, licencias, consumos y cobranza de SOFTeam.
La especificación completa está en [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md).

## Arrancar en desarrollo

Requisito: Node.js 22 o superior. No hace falta Postgres ni Docker: en
desarrollo y en los tests se usa PGlite (Postgres embebido).

```bash
npm install
npm run dev          # http://localhost:3000
```

La primera vez se crea la base en `.data/pglite`, se migra y se carga el
catálogo de ejemplo. Para empezar de cero, borrá `.data/`.

- **Panel SOFTeam:** `admin@softeam.local` / `Softeam.2026!`
  (se cambian con `ADMIN_EMAIL` y `ADMIN_PASSWORD`).
- **Portal del cliente:** registrate en `/registro`. Sin `RESEND_API_KEY`, los
  mails no se envían: el código de verificación aparece en la consola del servidor.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests del dominio y de la base de datos (Postgres real en memoria) |
| `npm run test:e2e` | Recorridos completos en Chromium, con el servidor de desarrollo levantado. `STLIC_LOG_DEV` indica el archivo de log del servidor, de donde se leen los códigos de verificación |
| `npm run typecheck` | Chequeo de tipos |
| `npm run lint` | Lint y formato (Biome) |
| `npm run build` | Build de producción |
| `npm run db:generate` | Genera la migración a partir de cambios en el esquema |

## Producción

Variables obligatorias: `DATABASE_URL` (Postgres/Neon), `BETTER_AUTH_SECRET`
(32+ caracteres), `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_REMITENTE`,
`STLIC_CLAVE_MAESTRA` (32 bytes en base64: `openssl rand -base64 32`; cifra los
secretos de los sistemas integrados) y `CRON_SECRET`.
El administrador inicial solo se crea si se define `ADMIN_PASSWORD`.

Cobro con Mercado Pago (opcional): `MERCADOPAGO_ACCESS_TOKEN` y
`MERCADOPAGO_WEBHOOK_SECRET` (la clave de las notificaciones). La URL de
notificaciones es `<BETTER_AUTH_URL>/api/pagos/aviso`. Sin credenciales, en
desarrollo el botón "Pagar ahora" abre un **simulador de pagos** (aprobar,
rechazar o pagar otro importe) que recorre el mismo circuito que el real; en
producción el link de pago queda deshabilitado.

Procesos programados (con `Authorization: Bearer <CRON_SECRET>`):

- `GET /api/cron/procesos`, una vez por día (06:00 de Argentina, ya configurado en
  `vercel.json`): renovación quincenal, proceso diario (excepciones de pago y
  alertas), recordatorios de cobro y envío de avisos por mail. Es idempotente:
  correrlo de nuevo no duplica nada. También se puede ejecutar desde
  *Panel SOFTeam → Procesos y alertas*.
- `GET /api/cron/eventos`, cada pocos minutos (fuera de Vercel Hobby): reintenta
  los avisos a los webhooks. Además, cada cambio intenta entregarlos en el momento.

## API para productos

Prodigal, CotiWeb, BienSeguro y el Boletín consultan licencias y configuración, e
informan consumos, en `/api/v1` con peticiones firmadas (HMAC-SHA256). El
contrato completo está en `/api/v1/openapi.json`; los sistemas y sus secretos se
administran en *Panel SOFTeam → Integraciones*.

## Estructura

```
docs/                    especificación
drizzle/                 migraciones SQL generadas
e2e/                     pruebas de punta a punta (Playwright)
src/domain/              reglas de negocio puras (sin I/O), con sus tests
src/server/db/           esquema Drizzle, conexión y datos iniciales
src/server/auth/         autenticación (Better Auth) y autorización
src/server/modules/      casos de uso por módulo (cuentas, catálogo, licencias)
src/app/(auth)/          ingreso, alta en línea y verificación del mail
src/app/(panel)/admin/   panel de SOFTeam
src/app/(panel)/portal/  portal del cliente
src/components/          UI compartida (shadcn/ui + componentes propios)
```
