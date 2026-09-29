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
| `STLicClientes.FacModo` (pago directo, factura adelantada, suscripción MP, débito en aseguradora) | medio de pago del cliente | ➕ se reemplazó por el medio de pago de alta y de renovación (transferencia, link, suscripción, planilla). ⚠️ **B** "factura adelantada": facturar al emitir la orden y no al pagar (decisión pendiente) |
| `STLicClientes.IdWoo`, `STLicPq.ProductoWoo` | — | ❌ WooCommerce descartado (se usa Mercado Pago + Xubio) |
| `STLicClientes.AdminMailValSino` / `AdminTelValSino` | mail verificado por código | ✅ el mail. ❌ la validación del teléfono (no la pide ningún proceso) |
| `STLicEmpresas` | `empresas` | ✅ nombre, nombre corto, país, tipo de cliente, instalación, activa, fecha de modificación, editables por SOFTeam |
| `STLicEmpresas.ProdiSino/BSSino/CWSino/CASino` | licencia vigente | ➕ se calcula de los paquetes vigentes: no se desincroniza |
| `STLicEmpresas.SincProdiFecHora` | eventos de salida y `modificadasDesde` | ➕ sincronización por webhooks y listado incremental |
| `StLicClienteGrupo` | `grupos_economicos` | ✅ *Panel SOFTeam → Grupos económicos*: alta, edición, cliente principal, cliente de facturación consolidada, miembros y baja del grupo vacío |
| `STLicCanales`, `STLicOficinas` | `canales`, `oficinas` | ✅ alta, edición (contacto, WhatsApp, redes), desactivación (conservando una activa) y renombrar canales, respetando el alcance del delegado. ⚠️ **C** "notifica" por oficina (hoy es una política de toda la empresa) |
| `STLicPaquetesDisponibles`, `STLicAlternativasPq` | `paquetes`, `alternativas`, recursos | ➕ recursos genéricos en vez de columnas fijas por producto |
| `STLicPaquetesEmpresa` | `contratos` | ✅. ✅ baja de un contrato activo desde la ficha del cliente (`STLicInactivarPaqueteEmpresa`), con motivo y solo Administración |
| `STLicPaquetesMovimientos` | `movimientos_saldo` | ✅ libro inmutable. ⚠️ **C** ver los movimientos de un contrato desde SOFTeam |
| `STLicOrden` | `ordenes` + `orden_items` | ➕ detalle por línea, cálculo congelado |
| `STLicMediosPago` | `medios_pago` | ✅ |
| `STLicMonedas` (con cotización) | moneda del país | ⚠️ **C** ABM de monedas y cotización (hoy una moneda por país) |
| `STLicPaises`, `STLicProvincias` | `paises`, provincias fijas | ⚠️ **C** ABM de países y provincias (hoy vienen de la carga inicial) |
| `STLicNotiMedio` (medios y factor) | `medios_envio` | ✅ modelo. ⚠️ **C** editar los factores desde SOFTeam |
| `STLicPoliticas` | `politicas_empresa` | ✅ |
| `STLicProductores`, `STLicProdCia` | `productores`, `productor_codigos` | ✅ |
| `STLicUsuarios` | `colaboradores` | ✅ con accesos, permisos y alcance |
| `Aseguradoras`, `STLicAseguradoras` | `aseguradoras`, `empresa_aseguradoras` | ✅ catálogo editable e interfaces con baja al mes siguiente |
| `StLicAlertas` | `alertas` | ➕ deduplicadas, con envío por mail y aviso anticipado |
| `TipoComunicacion` (tipos de comunicación por empresa: sistema, productor, mail, SMS, push, WhatsApp; usuario origen, destino y autorizante) | — | ⚠️ **B** falta. Es configuración que consumen los productos de notificaciones: hay que definir con el equipo de BienSeguro y el Boletín si sigue en STLic o pasa a cada producto |
| `Parametro`, `TParametros`, `TParametros0` | `parametros` | ✅ modelo. ⚠️ **B** editarlos desde SOFTeam (hoy por base de datos) |
| `TNumeradores` | secuencias de Postgres | ➕ sin tabla de numeradores ni bloqueos |
| `TLog` | `auditoria` | ➕ antes y después de cada cambio, por empresa |
| `SMTPConfig` | variables de entorno + Resend | ➕ sin credenciales en la base |
| `DescargaPolizas.UltimoNumero` | — | ❌ es de Prodigal, no de licencias |

## Paneles y procesos

| KB | STLic | Estado |
|---|---|---|
| `AltaNuevoCliente` (asistente de 5 pasos) | alta en línea con verificación del mail y *Clientes → Nuevo cliente* | ✅ alta en línea y alta por SOFTeam (cliente, empresa, oficina inicial y administrador, con mail de acceso opcional). ✅ nueva empresa para un cliente existente (`STLicClienteEmpresas`, `STEmpresaCrea`) |
| `StLicClienteUpdate`, `STLicClienteModifica`, `STLicUpdateEmp` | editar cliente y empresa | ✅ |
| `ImportDataCSV` + `PSTLic*LeeCSV` (clientes, empresas, canales y oficinas, provincias, aseguradoras, usuarios, productores, códigos por compañía) | *Panel SOFTeam → Importar datos* | ✅ clientes y empresas (conserva el número de empresa), canales y oficinas, usuarios, productores, códigos por compañía, catálogo de aseguradoras y aseguradoras de cada empresa. Separado por `;` con títulos (de la KB o simples), revisión antes de importar, todo o nada, plantilla por tipo. Provincias: lista fija de Argentina |
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
| Exportaciones de cada listado (`*WWExport`) | CSV de clientes, órdenes, consumos y reportes | ✅ parcial. ⚠️ **C** exportar aseguradoras, productores, usuarios y paquetes |
| `PParam*`, `Parametro_*LectEscr` | `leerParametro` | ✅ |
| GAM (usuarios, roles, recuperación) | Better Auth | ➕ verificación por código, 2FA, sesiones en base |

## Plan

1. **A:** editar clientes y empresas (y desactivarlas), alta y edición de
   grupos económicos, alta de cliente y de empresa por SOFTeam, importación
   desde CSV.
2. **B:** editar y desactivar oficinas y canales, dar de baja un contrato
   puntual, parámetros editables, decidir "factura adelantada" y
   `TipoComunicacion`.
3. **C:** monedas y cotización, países y provincias, factores de los medios
   de envío, movimientos de un contrato, exportaciones restantes,
   "notifica" por oficina.
