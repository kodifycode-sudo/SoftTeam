# Comparación con la KB GeneXus

Inventario de la KB `Clientes_PAS` (exportación `Softeam_1.xpz`, 25/09/2026)
contra STLic, para no perder nada de lo que existía. De sus 1.714 objetos, 517
son propios (el resto es GAM, Work With Plus y otros generados): 30
transacciones, 120 paneles, 139 procedimientos, 17 SDT y 75 dominios.

Estados:
- ✅ **Cubierto:** STLic lo tiene (a veces con otro diseño).
- ➕ **Mejorado:** STLic lo resuelve mejor; se indica cómo.
- ⚠️ **Falta:** hay que agregarlo. Prioridad: **A** (operación diaria), **B**
  (importante), **C** (puede esperar).
- ❌ **Descartado:** no se migra, con el motivo.

## Transacciones

| KB | STLic | Estado |
|---|---|---|
| `STLicClientes` | `clientes` | ✅ datos fiscales, contactos, grupo, medios de pago, Xubio, observaciones, editables por SOFTeam |
| `STLicClientes.FacModo` (pago directo, factura adelantada, suscripción MP, débito en aseguradora) | medio de pago del cliente | ➕ se reemplazó por el medio de pago de alta y de renovación (transferencia, link, suscripción, planilla). ✅ decidido (29/09/2026): la factura se emite al cobrar; con la orden y el pago hay un recibo provisorio |
| `STLicClientes.IdWoo`, `STLicPq.ProductoWoo` | — | ❌ WooCommerce descartado (se usa Mercado Pago + Xubio) |
| `STLicClientes.AdminMailValSino` / `AdminTelValSino` | mail verificado por código | ✅ el mail. ❌ la validación del teléfono (no la pide ningún proceso) |
| `STLicEmpresas` | `empresas` | ✅ nombre, nombre corto, país, tipo de cliente, instalación, activa, fecha de modificación, editables por SOFTeam |
| `STLicEmpresas.ProdiSino/BSSino/CWSino/CASino` | licencia vigente | ➕ se calcula de los paquetes vigentes: no se desincroniza |
| `STLicEmpresas.SincProdiFecHora` | eventos de salida y `modificadasDesde` | ➕ sincronización por webhooks y listado incremental |
| `StLicClienteGrupo` | `grupos_economicos` | ✅ *Panel SOFTeam → Grupos económicos*: alta, edición, cliente principal, cliente de facturación consolidada, miembros y baja del grupo vacío |
| `STLicCanales`, `STLicOficinas` | `canales`, `oficinas` | ✅ alta, edición (contacto, WhatsApp, redes), desactivación (conservando una activa) y renombrar canales, respetando el alcance del delegado. ✅ "notifica" por oficina (`STLicOficinas.Notifica`): se marca en cada oficina y la política de la empresa es el interruptor general; los productos lo reciben en EmpresaFull |
| `STLicPaquetesDisponibles`, `STLicAlternativasPq` | `paquetes`, `alternativas`, recursos | ➕ recursos genéricos en vez de columnas fijas por producto |
| `STLicPaquetesEmpresa` | `contratos` | ✅. ✅ baja de un contrato activo desde la ficha del cliente (`STLicInactivarPaqueteEmpresa`), con motivo y solo Administración |
| `STLicPaquetesMovimientos` | `movimientos_saldo` | ✅ libro inmutable. ✅ *Clientes → ficha → Paquetes vigentes → Movimientos*: cargas, consumos y ajustes de un contrato con el saldo después de cada uno y el saldo actual |
| `STLicOrden` | `ordenes` + `orden_items` | ➕ detalle por línea, cálculo congelado. ✅ bonificación de un paquete por SOFTeam en la orden pendiente (con motivo, recurrente o solo esa orden) |
| `STLicMediosPago` | `medios_pago` | ✅ |
| `STLicMonedas` (con cotización) | `monedas` | ✅ *Panel SOFTeam → Países y monedas*: alta, edición y cotización en pesos con su fecha; el peso es la base (vale 1) y no se desactiva una moneda que usa un país activo |
| `STLicPaises`, `STLicProvincias` | `paises`, `provincias` | ✅ ABM de países (moneda, IVA general, prefijo, nombre corto; siempre uno activo) y de provincias por país (código ISO 3166-2). Los formularios y la importación toman las provincias de la base |
| `STLicNotiMedio` (medios y factor) | `medios_envio` | ✅ *Panel SOFTeam → Parámetros → Medios de envío*: factor y estado editables por Administración, auditados; el mail no se desactiva |
| `STLicPoliticas` | `politicas_empresa` | ✅ |
| `STLicProductores`, `STLicProdCia` | `productores`, `productor_codigos` | ✅ |
| `STLicUsuarios` | `colaboradores` | ✅ con accesos, permisos y alcance |
| `Aseguradoras`, `STLicAseguradoras` | `aseguradoras`, `empresa_aseguradoras` | ✅ `Aseguradoras`: catálogo de SOFTeam, editable e importable por archivo. `STLicAseguradoras`: la empresa elige en su portal con cuáles trabaja y qué interfaces activa (baja al mes siguiente); no se importa |
| `StLicAlertas` | `alertas` | ➕ deduplicadas, con envío por mail y aviso anticipado |
| `TipoComunicacion` (tipos de comunicación por empresa: sistema, productor, mail, SMS, push, WhatsApp; usuario origen, destino y autorizante) | `tipos_comunicacion` | ✅ decidido (29/09/2026): sigue en STLic. *Portal → Comunicaciones* (administración de toda la empresa): medios y, por tipo de usuario que la origina, destinatarios y autorizantes; los tipos de usuario conservan el código de la KB. Llegan a los productos en EmpresaFull y SOFTeam los ve en la ficha del cliente |
| `Parametro`, `TParametros`, `TParametros0` | `parametros` | ✅ *Panel SOFTeam → Parámetros*: días de renovación, semáforo y recordatorios de cobro, avisos de vencimiento, saldo bajo y pedido de facturación de oficinas, con validación y auditoría |
| `TNumeradores` | secuencias de Postgres | ➕ sin tabla de numeradores ni bloqueos |
| `TLog` | `auditoria` | ➕ antes y después de cada cambio, por empresa |
| `SMTPConfig` | variables de entorno + Resend | ➕ sin credenciales en la base |
| `DescargaPolizas.UltimoNumero` | — | ❌ es de Prodigal, no de licencias |

## Paneles y procesos

| KB | STLic | Estado |
|---|---|---|
| `AltaNuevoCliente` (asistente de 5 pasos) | alta en línea con verificación del mail y *Clientes → Nuevo cliente* | ✅ alta en línea y alta por SOFTeam (cliente, empresa, oficina inicial y administrador, con mail de acceso opcional). ✅ nueva empresa para un cliente existente (`STLicClienteEmpresas`, `STEmpresaCrea`) |
| `StLicClienteUpdate`, `STLicClienteModifica`, `STLicUpdateEmp` | editar cliente y empresa | ✅ |
| `ImportDataCSV` + `PSTLic*LeeCSV` (clientes, empresas, canales y oficinas, provincias, aseguradoras, usuarios, productores, códigos por compañía) | *Panel SOFTeam → Importar datos* | ✅ clientes y empresas (conserva el número de empresa), canales y oficinas, usuarios, productores, códigos por compañía y catálogo de aseguradoras (las de cada empresa no se importan: las elige la empresa). Formato fijo: nombres de los campos en la primera línea (de la KB o simples) y valores separados por `;`, con manual de exportación por tabla en la pantalla, revisión antes de importar, todo o nada, plantilla por tipo. Provincias: lista fija de Argentina |
| `WizardCheckOut`, `ConfirmartPqDisponibles`, `SelectPqDisponibles` | carrito y checkout | ➕ carrito persistente, cálculo en el servidor, idempotente |
| `STLicCalculaTotalesOrden`, `StLicOrdenRegistro` | dominio `calculo-orden` y `confirmarOrden` | ➕ con las correcciones N1, N2 y N3 de la KB |
| `StLicPaquetesEmpresaRegistro`, `StLicPaquetesEmpresaUpdTotales`, `StLicPaquetesEmpresaTotalesGet` | licencia calculada de los contratos | ➕ sin totales guardados que se desincronicen |
| `Cantidad*Usuarios*`, `RetornaCantidad*` | uso de límites y API de licencia | ✅ |
| `STLicEmpresaGet`, `STLicListaEmpresasGet`, `StLicObtieneDatos`, `StLicRetornaEmp` | API v1 (EmpresaFull, listado) | ✅ firmada con HMAC |
| `MenuSofteam`, `MenuLicencias`, `GetHomeModules*` | menús por rol y permiso | ✅ |
| `ModificaEstadoUsuario`, `ModificaEstadoProductor` | baja y reactivación | ✅ |
| `AltaStLicUsuarios`, `AltaUsuarioGAM` | invitación por mail | ➕ el usuario elige su contraseña |
| `EliminaAseguradoraXEmpresas` | dejar de trabajar con una aseguradora | ✅ con baja de interfaces al mes siguiente |
| `EnviaMail`, `ValidarMail`, `ValidarTelefonoArgentina` | Resend, validación con Zod | ✅ |
| Exportaciones de cada listado (`*WWExport`) | CSV (Excel) de cada listado | ✅ clientes, órdenes, consumos, reportes, aseguradoras y paquetes (SOFTeam); usuarios, productores y códigos por compañía (portal, respetando el alcance). Los del portal usan los títulos de la importación: se pueden volver a importar |
| `PParam*`, `Parametro_*LectEscr` | `leerParametro` | ✅ |
| GAM (usuarios, roles, recuperación) | Better Auth | ➕ verificación por código, 2FA, sesiones en base |

## Plan

1. ✅ **A:** editar clientes y empresas (y desactivarlas), alta y edición de
   grupos económicos, alta de cliente y de empresa por SOFTeam, importación
   de datos.
2. ✅ **B:** editar y desactivar oficinas y canales, dar de baja un contrato
   puntual, parámetros editables, bonificación de paquetes por SOFTeam.
3. ✅ **C:** factores de los medios de envío, movimientos de un contrato,
   exportaciones restantes, "notifica" por oficina.

Decisiones pendientes (no se implementan hasta definirlas):

- **Vender en otro país:** países, monedas y provincias ya se configuran,
  pero el alta de clientes sigue siendo de Argentina: falta definir la
  identificación fiscal de cada país (hoy CUIT), su condición impositiva y
  quién factura allá (Xubio es de Argentina).
- **Pedido de cambio de facturación desde el portal**: hecho y apagado con
  el parámetro `oficinas.pedido_facturacion` hasta confirmar el caso.
