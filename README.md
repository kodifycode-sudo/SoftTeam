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
(32+ caracteres), `BETTER_AUTH_URL`, `RESEND_API_KEY` y `EMAIL_REMITENTE`.
El administrador inicial solo se crea si se define `ADMIN_PASSWORD`.

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
