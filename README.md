# STLic

Plataforma de cuentas, licencias, consumos y cobranza de SOFTeam.
La especificación completa está en [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md).

## Requisitos

- Node.js 22 o superior. No hace falta instalar Postgres ni Docker: en
  desarrollo y en los tests se usa PGlite (Postgres embebido).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (dominio + base de datos real en memoria) |
| `npm run typecheck` | Chequeo de tipos |
| `npm run lint` | Lint y formato (Biome) |
| `npm run db:generate` | Genera la migración a partir de cambios en el esquema |

## Estructura

```
docs/                 especificación
drizzle/              migraciones SQL generadas
src/domain/           reglas de negocio puras (sin I/O), con sus tests
src/server/db/        esquema Drizzle y cliente de base de datos
src/app/              rutas de Next.js
```
