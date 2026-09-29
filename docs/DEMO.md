# Datos de demostración

Para ver STLic en ejecución con datos de ejemplo, en desarrollo (base
PGlite en `.data/pglite`):

```bash
# Con el servidor de desarrollo detenido (PGlite admite un solo proceso)
npm run db:demo
npm run dev        # http://localhost:3000
```

Carga todo con las mismas reglas del sistema (altas, carrito, pagos,
consumos). Si ya se cargó, no hace nada. Para empezar de cero, borrar
`.data/pglite` y volver a correrlo. Las pruebas automáticas (e2e) crean
clientes en la misma base: conviene correrlas sobre otra copia.

**Contraseña de todos los usuarios, también el administrador: `admin123`**
(solo para esta base de desarrollo). Para correr las pruebas e2e sobre ella:
`E2E_ADMIN_PASSWORD=admin123 npx playwright test`.

## SOFTeam (`/admin`)

| Usuario | Rol | Qué ve |
|---|---|---|
| admin@softeam.local | Administración | Todo: clientes, órdenes, parámetros, países, importación |
| comercial@softeam.local | Comercial | Clientes, órdenes, bonificaciones, altas |
| soporte@softeam.local | Soporte | Bandeja de soporte (hay un pedido respondido y otro abierto) |

## Clientes (`/portal`)

| Usuario | Empresa | Perfil |
|---|---|---|
| ana@brokerdelsur.demo | Broker del Sur | Administradora general: todo |
| bruno@brokerdelsur.demo | Broker del Sur | Administrador comercial (compras, órdenes) |
| carla@brokerdelsur.demo | Broker del Sur | Administradora operativa (usuarios, productores) |
| diego@brokerdelsur.demo | Broker del Sur | Delegado del canal 02 Interior (Rosario y Córdoba) |
| elena@brokerdelsur.demo | Broker del Sur | Delegada de la oficina 02-001 Rosario |
| jorge@andino.demo | Andino Mendoza y Andino San Juan | Administrador de dos empresas (selector de empresa) |
| valeria@andino.demo | Andino Mendoza | Administradora comercial |
| martin@productor.demo | Martínez Seguros | Productor independiente, con una orden pendiente de pago |
| gabriela@patagonia.demo | Patagonia Brokers | Cliente principal del Grupo Patagonia |
| hernan@austral.demo | Austral Productores | Miembro del Grupo Patagonia |
| irene@litoral.demo | Litoral Asesores | Licencia vencida: avisos y renovación |

## Qué hay cargado

- **Broker del Sur:** licencia completa (Prodigal Full anual, CotiWeb,
  BienSeguro, notificaciones y soporte), 4 oficinas en 2 canales, usuarios
  con cada perfil, 3 productores con códigos, 5 aseguradoras con
  interfaces, consumos de la empresa y de cada oficina, 2 pedidos de
  soporte, tipos de comunicación, marca blanca y una orden pendiente.
- **Andino Seguros:** un cliente con dos empresas; la corporativa tiene una
  orden sin pagar.
- **Grupo Patagonia:** dos clientes, factura el principal.
- **Litoral Asesores:** un paquete vencido, con sus avisos.
