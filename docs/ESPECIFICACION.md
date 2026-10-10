# STLic — Especificación funcional

Plataforma de cuentas, licencias, consumos y cobranza de SOFTeam.
Fuente única de verdad del sistema: cada regla de negocio está escrita acá y,
cuando cambia, se actualiza en este documento.

---

## 1. Visión

SOFTeam vende software a intermediarios de seguros: **Prodigal** (gestión de
cartera), **CotiWeb** (multicotización y emisión), **BienSeguro** (portal y app
para asegurados), **Boletín@** (boletín para asegurados) y servicios
complementarios (mail marketing, notificaciones).

STLic es el sistema detrás del catálogo:

1. **Cuentas:** clientes, empresas, oficinas, usuarios, aseguradoras y productores.
2. **Licencias:** qué puede usar cada empresa. Es la suma de sus paquetes vigentes.
3. **Consumos:** saldos de notificaciones y cotizaciones, con un libro de movimientos.
4. **Venta y cobro:** carrito, órdenes, cálculo de impuestos y descuentos,
   medios de pago, renovación automática, MercadoPago y Xubio.
5. **Autogestión:** el cliente se da de alta, configura y compra sin intervención
   de SOFTeam.
6. **Integración:** los productos consultan licencias y configuración, e informan
   consumos, por una API firmada con webhooks de sincronización.

Audiencias: **SOFTeam** (Soporte, Comercial, Administración), **Cliente**
(Administrador general, comercial y operativo, más administradores delegados
por oficina) y **Productos** (clientes de la API).

---

## 2. Decisiones de diseño

| Tema | Decisión |
|---|---|
| Pasarela | MercadoPago + Xubio. Sin WooCommerce. |
| Prórroga | Tolerancia de pago según el modo de facturación (ver 4.6). Prorrogado no es un estado guardado: es un contrato `ACTIVO` vencido que sigue sumando hasta `prorroga_hasta` mientras su renovación espera el pago (la vigencia se sigue calculando por fechas, sin depender del proceso diario). Al pagarse la renovación, deja de estar prorrogado. |
| Tipo de cliente | Tres ejes independientes: **modo de facturación** del cliente (4.6), **grupo económico** (organización y reportes) y **facturación consolidada** (grupo con cliente de facturación + medio de pago de planilla). No hay un tipo de cliente aparte: el pago directo es el modo 0 y la factura agrupada, el 3. |
| Detalle de orden | Hay tabla `orden_item`: cada línea congela precio de lista, bonificación, precio final y el total prorrateado. Lo necesita la factura y la orden agrupada, que mezcla empresas. |
| Carrito | Tabla `carrito_item` persistente por empresa. Los contratos recién existen al confirmar, así no hay filas borrador mezcladas con contratos reales y el carrito sobrevive entre dispositivos. |
| Licencia por oficina | Ver sección 4.3: la licencia es de la **empresa**. Un contrato puede estar **asignado a una oficina**, solo para consumos y para la oficina que compra por su cuenta. |
| Fecha de inicio | Alta: **desde el día de activación** (sección 4.2). Renovación: **empalma** con el fin del contrato anterior. Sin días de regalo. |

---

## 3. Modelo de dominio

```
Pais ──< Aseguradora
GrupoEconomico ──< Cliente ──< Empresa ──< Oficina (CC-OOO, canal = CC)
                     │            ├──< Colaborador (usuarios de los productos)
                     │            ├──< EmpresaAseguradora (interfaces activas)
                     │            ├──< Productor ──< ProductorCodigo (por aseguradora)
                     │            ├──< CarritoItem
                     │            └──< Contrato ──< ContratoRecurso (snapshot de límites)
                     │                     └──< MovimientoSaldo (libro de consumos)
                     └──< Orden ──< OrdenItem ──> Contrato
Producto ──< Recurso
Paquete ──< PaqueteRecurso, Paquete ──< Alternativa
MedioPago, Ticket ──< TicketPaquete, Parametro, Alerta, JobRun,
EventoSalida (outbox), ApiCliente, Auditoria
```

### 3.1 Recursos genéricos en lugar de columnas fijas

Con columnas fijas por paquete (`ProdigalUsrCant`, `CWPresuMesCant`…),
agregar un producto o un límite obligaría a cambiar tablas, pantallas y APIs.

Ahora los límites son datos: un catálogo de **recursos**, y cada paquete declara
cantidades de algunos de ellos.

| Clase de recurso | Ejemplos | Cómo se suma |
|---|---|---|
| `CAPACIDAD` | usuarios Prodigal, pólizas, GB, interfaces, años de retención | Suma de los contratos vigentes |
| `FUNCION` | chatbot, API, e-commerce, motos, institorio | Habilitada si algún contrato vigente la trae |
| `CUPO_MENSUAL` | notificaciones y cotizaciones del mes | Cupo del mes, se renueva solo cada mes (4.4) |
| `SALDO` | notificaciones y cotizaciones sin vencimiento | Prepago que se agota con el uso |

Reglas del paquete:
- Un paquete es **TEMPORAL** (`CAPACIDAD`, `FUNCION`, `CUPO_MENSUAL`, con
  alternativas en meses) o **CONSUMIBLE** (solo `SALDO`, sin vencimiento).
  Nunca se mezclan.
- **Acumulación:** cada capacidad declara si se **suma** entre contratos y
  unidades (usuarios, pólizas, GB) o si vale el **máximo** (años de retención
  de cartera: dos paquetes de 2 años siguen siendo 2 años). La cantidad
  contratada solo multiplica las que se suman.
- **Reglas derivadas** declarativas: por ejemplo, la emisión de CotiWeb se
  habilita con 4 o más usuarios de CotiWeb.

### 3.2 Cantidad

Un contrato tiene `cantidad` de unidades. **Multiplica límites y precio, nunca
la duración.** Si multiplicara los meses, 3 unidades de un plan anual darían
36 meses con el triple de usuarios.

---

## 4. Licencias

### 4.1 Estados del contrato

El **estado** refleja la situación de pago. La **vigencia** se calcula por fechas.
Son dos conceptos separados.

| Estado | Significado | ¿Suma a la licencia? |
|---|---|---|
| `PEND_PAGO` | Orden emitida, sin pagar | No |
| `PEND_PAGO_ACTIVO` | Habilitado sin pago: modo 1 con tolerancia, modo 3 sin límite, o excepción manual con fecha límite | Sí, si está dentro del período y del plazo |
| `ACTIVO` | Pagado o activado manualmente | Sí, dentro del período |
| `CANCELADO` | Anulado (siempre manual) | No |
| `BAJA` | Dado de baja manualmente antes de tiempo | No |

"Vencido" no es un estado: es `hoy > hasta`. Por eso la licencia es correcta a
cualquier hora, sin depender de que haya corrido el proceso diario: un paquete
vencido deja de sumar en el acto, no en la corrida del día siguiente.

**Vigente(hoy)** =
- estado `ACTIVO`, o `PEND_PAGO_ACTIVO` con `pendPagoActivoHasta` nula o ≥ hoy; **y**
- si es temporal: `desde ≤ hoy ≤ hasta`; si es consumible: saldo > 0.

`PEND_PAGO_ACTIVO` también exige estar dentro del período. Si solo se mirara la
fecha límite, un contrato impago de un período ya terminado seguiría sumando
para siempre, encima de su renovación, y duplicaría la licencia.

### 4.2 Fechas

| Caso | `desde` | `hasta` |
|---|---|---|
| Trimestre inicial, modos 0 y 2 | Fecha de activación (pago confirmado) | desde + 3 meses − 1 día |
| Trimestre inicial, modos 1 y 3 | Fecha de confirmación (nace habilitado) | desde + 3 meses − 1 día |
| Adicional y alta a grupo | Fecha del alta | Vencimiento de los paquetes que ya tiene (tramo, 4.2.1) |
| Renovación | Día siguiente al `hasta` del contrato anterior | Día de vencimiento + período (4.2.1) |

- **Trimestre inicial en los modos 0 y 2:** mientras no paga, las fechas son
  provisorias y se recalculan al activar. Así el cliente no pierde los días que
  tardó en pagar.
- **Renovación:** empalma con el contrato anterior. No se pierden ni se
  superponen días, aunque se pague tarde.

#### 4.2.1 Ciclo mensual alineado

Los paquetes temporales de un cliente vencen el mismo día del mes, 10 o 20
(`renovacion.dias_vencimiento`); `hasta` es ese día y el período siguiente
empieza el día después. El ajuste se cobra como **tramo prorrateado**:
precio × días / divisor (365 si el plan es anual; 30 por mes en otro caso),
redondeado a centavos, con la cascada completa (bonificación, ticket, ajuste
del medio e IVA). Cálculo único en `src/domain/licencias/periodo.ts`.

- **Planes:** mensual (1), anual (12) y **trimestral inicial** (3). El
  primer alta temporal de un cliente no agrupado es siempre trimestral, se
  factura completa y nace **sin día de vencimiento**; después, solo mensual o
  anual. El catálogo del portal ofrece lo que corresponde y la cotización lo
  valida (`PLAN_NO_PERMITIDO`). Los grupos no tienen trimestre inicial.
- **Renovación:** desde = vencimiento anterior + 1. Si ya está alineado y se
  genera antes, no hay tramo. Si no, el tramo llega al primer día de
  vencimiento posterior a desde + mínimo − 1 (`renovacion.minimo_dias_tramo`,
  10) y a hoy: un acuerdo tardío cubre todo lo transcurrido. Cobra tramo más
  período, en una sola orden.
- **Adicional:** cobra solo el tramo desde hoy hasta el mayor vencimiento de
  los paquetes de la empresa con ese día (o hasta el fin del trimestre), sin
  mínimo; así termina junto con lo que ya tiene. La corrida lo renueva con los
  demás.
- **Día de vencimiento:** se propone el de los otros paquetes del cliente (o
  el del contrato que se renueva) y el carrito deja elegir el otro; es único
  por orden. No se elige en el trimestre inicial (se negocia) ni en los
  clientes agrupados (fijo, `renovacion.dia_vencimiento_grupo`, 10). Una vez
  generada la orden automática, solo Administración puede cancelarla y
  reemitirla con otro día.
- **Trimestre inicial:** no se renueva solo ni desde el portal. Lo
  negocia Administración (medio, mensual o anual y día) y emite la orden con
  el tramo más el período desde la orden manual de SOFTeam (sección 6). El
  tablero "Para negociar" lista los trimestres del mes y enlaza con esa
  orden. Si no se acuerda a tiempo, sigue las reglas de vencimiento de su
  modo.
- **Altas a grupo:** el cliente agrupado que paga por planilla no genera
  una orden al confirmar. El contrato se graba con su tramo, **sin orden**, y
  la orden colectiva de la próxima corrida lo incorpora junto con las
  renovaciones del grupo (una orden por factura); como vence ese día, la misma
  corrida lo renueva y cobra también su primer período. El tramo llega al
  mayor vencimiento del grupo o, en el primer alta, al primer día 10 cuya
  corrida todavía no pasó. Hasta entonces, Administración puede anularlo.
- **Bases existentes:** la migración deja el día 20 a los contratos que ya
  vencen ese día y el 10 al resto (se alinean con un tramo en la próxima
  renovación), y agrega el plan trimestral a los paquetes con plan mensual (tres
  veces el precio mensual, editable).
- **Edición manual de `hasta`** (consolidación de vencimientos): solo
  Administración SOFTeam, con motivo obligatorio y auditoría. Si hay suscripción
  en MercadoPago, pregunta si regenerarla. Es la única excepción a la
  inmutabilidad del contrato.

### 4.3 Empresa y oficinas

- **Toda empresa tiene al menos una oficina** (`01001`, que se crea con el alta).
  Una empresa con una sola oficina y otra con muchas usan el mismo modelo.
- **La licencia pertenece a la empresa.** Las capacidades y las funciones son un
  único pozo de la empresa, y el administrador distribuye usuarios e interfaces
  entre oficinas.
- **Un contrato puede estar asignado a una oficina.** Se usa para dos cosas:
  1. **Consumos:** una oficina consume primero de sus propios contratos y después
     del pozo de la empresa, si la política lo permite y hasta su tope mensual.
  2. **Compra delegada:** un administrador delegado de oficina compra paquetes
     para su oficina, que puede facturarse a otro cliente.
- **Visibilidad** de usuarios y contratos: toda la empresa, un canal (`CC`) o una
  oficina (`CC-OOO`).

#### A quién se factura

| Nivel | Qué es |
|---|---|
| Grupo económico | Agrupa clientes (CUIT distintos). Su cliente facturador recibe la factura consolidada cuando el medio de pago es de planilla |
| Cliente | Razón social con CUIT: contrata y recibe la factura. Puede tener varias empresas |
| Empresa | Instalación licenciada (número que usan los productos): licencia, usuarios y datos propios |
| Oficina | Punto de venta dentro de una empresa |

Una orden se factura al cliente de la empresa, salvo:

1. **Planilla de un grupo económico:** al cliente facturador del grupo.
2. **Oficina pagada por otra razón social:** al cliente de facturación de la
   oficina. Es el caso de una oficina que comparte la instalación (cartera,
   usuarios) pero la paga otro CUIT, por ejemplo un productor independiente
   dentro de la red de un organizador, que necesita la factura a su nombre.
   Si la oficina es independiente en todo, lo correcto es darla de alta como
   cliente y empresa propios.

**Decisión pendiente (2026-09-27):** confirmar con Comercial si el caso 2
existe en los clientes reales. Hasta entonces, el cliente de facturación de
una oficina **solo lo asigna SOFTeam** (ficha del cliente) y el pedido desde
el portal está oculto: parámetro `oficinas.pedido_facturacion` en `false`.
El flujo del pedido (la empresa lo pide, SOFTeam aprueba o rechaza con motivo)
ya está hecho y probado; habilitarlo es cambiar el parámetro a `true`.

### 4.4 Consumos (libro de movimientos)

- Cada movimiento (carga, consumo, ajuste) es **una fila inmutable** en
  `movimiento_saldo`. El saldo es la suma de sus movimientos: siempre auditable.
  Para no sumar todo el historial en cada consumo, el saldo prepago de cada
  contrato y recurso se guarda acumulado en `contrato_recursos.saldo`; lo
  actualiza un trigger de la base con cada movimiento, en la misma transacción,
  y rechaza un movimiento de saldo de un recurso que el contrato no tiene.
- **Cupo mensual:** disponible = cupo del mes − consumido en el mes. **No hay
  proceso de reposición**: el mes nuevo empieza con el consumo en cero. Se elimina
  un job y su riesgo de no correr.
- **Orden de débito:** cupo mensual antes que saldo prepago; contratos de la
  oficina antes que los de la empresa; dentro de cada grupo, el más antiguo
  primero (FIFO).
- **Factor por medio de envío** (tabla configurable): mail 1, SMS 2, WhatsApp 2,5.
- **Modos:** `TODO_O_NADA` o `PARCIAL`. Cada pedido responde un resultado:
  `OK`, `PARCIAL` (no alcanzó y se entregó lo que había) o `SIN_SALDO`. Si no
  alcanza, se registra la alerta `CONSUMIBLE_SIN_SALDO` (una por día, empresa
  u oficina y familia) para el cliente y para el tablero de SOFTeam.
- **Idempotencia:** clave única (sistema, id de transacción externa). Un reintento
  del producto no descuenta dos veces.
- **Concurrencia:** el débito bloquea la fila de la empresa
  (`SELECT … FOR UPDATE`). Dos consumos simultáneos no pueden dejar saldo
  negativo. Con `espera: ESPERAR` (por defecto) el segundo pedido espera hasta
  `consumibles.espera_ms`; con `NO_ESPERAR` responde `EN_CURSO_REINTENTAR` y el
  producto reintenta con la misma transacción.

#### 4.4.1 Consumibles

- **Quién consume qué:** presupuestos (cotizaciones) solo CotiWeb; los tickets
  de soporte solo STLic, al abrir un pedido. El producto del sistema que pide
  tiene que estar vigente para la empresa (`PRODUCTO_NO_VIVO`); las
  integraciones que no son productos de SOFTeam no se controlan
  (`TIPO_NO_HABILITADO` si el sistema no usa ese consumible).
- **Renovación por saldo:** un paquete consumible con renovación automática
  (marca por paquete, que el cliente cambia en el portal y que la renovación
  copia) se renueva cuando le queda `consumibles.porcentaje_renovacion` (10 %)
  o menos de lo que trajo, si no tiene ya una renovación y sigue vivo un
  producto que lo usa: cualquiera para notificaciones, CotiWeb para
  presupuestos. Se genera el mismo paquete al precio de renovación vigente, con
  la bonificación recurrente y el estado inicial del modo de facturación, sin
  día de vencimiento ni tramo. Cliente directo: una orden propia con el medio
  de la compra anterior (nunca por suscripción; si ya no sirve, el de
  renovación del cliente). Agrupado por planilla: sin orden, la incorpora la
  orden colectiva. Avisa al cliente (`RENOVACION_CONSUMIBLE`). Lo revisa el
  servicio después de cada consumo y el proceso diario como control. Cada
  paquete se evalúa por su propio saldo; el renovado se empieza a consumir
  cuando se agota el anterior (FIFO). Los tickets de soporte no se renuevan
  por saldo.
- **Reintegro** (`POST /api/v1/empresas/{numero}/reintegros`): devuelve
  unidades de una solicitud que no se usaron, con el factor de esa solicitud.
  Solo lo entregado y no reintegrado antes (`REINTEGRO_EXCEDE`); sistema,
  empresa y familia tienen que coincidir con la solicitud de origen. Va primero
  a los consumibles del mismo alcance (empresa u oficina), del más nuevo al más
  viejo y sin superar lo que trajo cada uno; lo que no entra vuelve a los
  contratos de los que salió (el cupo, al mes en que se consumió). Mismo
  bloqueo e idempotencia que los consumos; movimientos de tipo `REINTEGRO`.
  Un reintegro no anula una renovación ya generada.

### 4.5 Límites de configuración

Usuarios activos por producto ≤ licenciados, e interfaces activas por aseguradora
≤ licenciadas. Se valida al activar. Si una licencia baja, no se desactiva nada
automáticamente: se genera una alerta y el administrador elige qué desactivar.
La baja de una interfaz rige desde el mes siguiente.

Además, el proceso diario **avisa antes**: si en los próximos 15 días vence un
paquete y, sin su renovación, la empresa quedaría con más usuarios o
interfaces de los licenciados, avisa qué vence, cuándo y cómo quedaría, para
que renueve o elija qué dar de baja a tiempo. Una renovación ya vigente para
esa fecha evita el aviso.

### 4.6 Modo de facturación y tolerancia de pago

Cada cliente tiene un modo de facturación; en las órdenes agrupadas rige el del
cliente de facturación del grupo. El comportamiento de cada modo es fijo; la
tolerancia (parámetro `facturacion.tolerancia_dias`, por defecto 7, 30, 30 y 90)
y los medios de pago (cada medio marca con qué modos se usa) los configura
Administración.

| Modo | Estado inicial | Factura | Tolerancia de pago | Suspende | Tickets | Medios iniciales |
|---|---|---|---|---|---|---|
| 0 Pago directo | `PEND_PAGO` | Al cobrar | Prórroga del anterior: vencimiento + 7 días | Sí | Sí | Link de pago |
| 1 Factura adelantada | `PEND_PAGO_ACTIVO` | Al confirmar | Plazo del nuevo: inicio + 30 días | Sí | Sí | Transferencia |
| 2 Suscripción MP | `PEND_PAGO` | Al cobrar | Prórroga del anterior: vencimiento + 30 días | Sí | Sí | Suscripción y link |
| 3 Factura agrupada | `PEND_PAGO_ACTIVO` | Al confirmar | Sin límite; a los 90 días sin pago, aviso a SOFTeam | No | No | Planilla |

- **Factura adelantada (modos 1 y 3):** la factura se emite al confirmar la
  orden (y en la corrida diaria las renovaciones); la orden queda pendiente
  hasta que Administración registra la transferencia.
- **Prórroga:** al generarse la renovación de un contrato (automática o
  manual), en los modos 0 y 2 el contrato anterior sigue sumando hasta
  `hasta` + tolerancia. Si la renovación se paga, deja de estar prorrogado;
  si no, deja de sumar al terminar la prórroga. Mientras está prorrogado no se
  emite el aviso de licencia vencida.
- **Plazos editables:** Administración ajusta la prórroga o el plazo de un
  contrato habilitado sin pago desde la ficha del cliente (*Paquetes vigentes →
  Plazos*), con motivo y auditoría. La prórroga no puede terminar antes del
  vencimiento.
- El alta en línea nace en el modo 0. SOFTeam elige el modo en el alta y en la
  edición del cliente; los medios preferidos tienen que estar habilitados para
  ese modo.
- La planilla no está habilitada para el alta inicial: un cliente nuevo del
  modo 3 que paga por planilla compra su primer paquete como alta a grupo.

---

## 5. Orden y cálculo

### 5.1 Motor de cálculo (función pura)

Un único módulo, sin base de datos ni usuario, determinista y cubierto por tests.
Se usa igual en el carrito, en la edición de la orden y en la renovación.

```
por ítem:  precioLista = unitario(ALTA→compra | RENOVACION→renovación) × cantidad
           bonif       = redondear(precioLista × bonifPor / 100)
           precioFinal = precioLista − bonif
subtotal     = Σ precioFinal                       (ejemplo 2.6: 140.000)
ticket       = min(redondear(subtotal × ticketPor / 100), saldo del ticket)
baseNeta     = max(subtotal − ticket, 0)
ajustePago   = redondear(baseNeta × ajustePor / 100)   (recargo + / bonificación −)
netoGravado  = baseNeta + ajustePago
iva          = redondear(netoGravado × alícuota / 100)
total        = netoGravado + iva
prorrateo    = total repartido entre los ítems proporcional a su precioFinal
```

- **Importes en centavos enteros** (`bigint`). Los porcentajes se guardan en
  centésimos de punto (2 decimales). **Sin punto flotante en ningún cálculo** —
 .
- **Redondeo:** en cada paso, a 2 decimales, mitad alejándose de cero.
- **Prorrateo por restos mayores**. Reparte el redondeo entre los
  ítems con mayor resto, en lugar de cargarlo todo al último. La suma da el total
  exacto también con muchos ítems o con ítems en cero.
- **Condición frente al IVA:**
  la alícuota, el tipo de comprobante y el código ARCA salen de la condición
  del cliente de facturación, configurable por Administración en *Países y
  monedas → Condiciones frente al IVA* (tabla `condiciones_iva`, por país).
  Carga inicial de Argentina: Responsable Inscripto y Gran Contribuyente (A,
  ARCA 1), Monotributo con Factura B o con Factura A (ARCA 6), Exento (B, ARCA
  4), Consumidor Final (B, ARCA 5), todas al 21 %; Cliente del Exterior (E,
  0 %) dada de baja. **El exento paga IVA:** la exención es de sus ventas, no
  de lo que compra. No hay condición por defecto: sin
  condición activa la orden se rechaza (`IVA_COND_INVALIDA`) y el comprobante
  E todavía no se emite (`COMP_NO_HABILITADO`). La orden congela condición,
  código ARCA, comprobante y alícuota: un cambio en la tabla rige para las
  órdenes que se confirmen después. No se da de baja una condición que tienen
  clientes.

### 5.2 Rechazos

`SIN_ITEMS`, `MEDIO_NO_HABILITADO`, `MONEDA_INCONSISTENTE`, `PAQUETE_NO_DISPONIBLE`,
`ALTERNATIVA_INEXISTENTE`, `TICKET_INVALIDO`, `TICKET_VENCIDO`, `TICKET_AGOTADO`,
`TICKET_SOBRE_BONIFICADO`, `TICKET_CORPORATIVO`, `TICKET_PAQUETE_NO_HABILITADO`,
`IVA_COND_INVALIDA`, `COMP_NO_HABILITADO`.

Al cliente se le muestra siempre un mensaje genérico. El código detallado lo ven
solo los roles SOFTeam.

### 5.3 Medio de pago

Resolución: el que se eligió, o si no el preferido del cliente según la
instancia (alta, adicional o renovación). Validaciones, **en cadena**:
activo, país (vacío = todos) e instancia habilitada.

El cliente de facturación pasa a ser el del **grupo** solo si el medio es de
planilla **y** el grupo tiene cliente de facturación. La condición de IVA sale
siempre del cliente de facturación ya resuelto.

### 5.4 Confirmar la orden (transacción única)

Recalcular en el servidor, sin confiar en ningún importe que mande el navegador
→ crear la orden y sus ítems → crear los contratos (estado inicial según el tipo
de cliente) → vaciar el carrito → registrar el evento de salida.

**Todo en una transacción**, con una clave de idempotencia para que un doble
clic no genere dos órdenes.

Estado inicial del contrato, según el modo de facturación del cliente al que
se factura (4.6): modos 0 y 2 → `PEND_PAGO`; modo 1 → `PEND_PAGO_ACTIVO` hasta
hoy + tolerancia; modo 3 → `PEND_PAGO_ACTIVO` sin fecha límite (el servicio
nunca se corta solo). La orden congela el modo.

### 5.5 Estados de la orden

`PEND_PAGO` → `PAGADA` | `CANCELADA`. Un error de pago no es un estado: queda
marcado dentro de `PEND_PAGO`, con observación, fecha y hora, reintentos y
cantidad de reenvíos del link.

Cualquier cambio de medio de pago, ticket o bonificación mientras está
`PEND_PAGO` recalcula la orden e invalida el link de pago vigente.

**Órdenes sin importe:** si el total da cero (paquetes
bonificados al 100 % o un ticket del 100 %), la orden queda `PAGADA` en el
acto, sus contratos se activan y no se genera link ni factura. Vale para el
carrito, la renovación automática y la bonificación de SOFTeam.

---

## 6. Renovación, tickets y facturación consolidada

- **Generación quincenal** (idempotente, días de corte configurables:
  `renovacion.dias_corte`, 2 y 11).
  El día 2 renueva los contratos que vencen del 3 al 12 del mes (los alineados
  al 10); el día 11, los que vencen del 13 al 2 del mes siguiente (los
  alineados al 20). Los rangos cubren todos los días del mes, porque siguen
  existiendo vencimientos sueltos. Se excluyen los paquetes sin día de
  vencimiento (trimestre inicial, 4.2.1).
  - Se evalúa todos los días sobre las ventanas cuyo corte ya pasó (la del mes
    anterior y la del actual): un contrato comprado después del corte también
    se renueva, y un día sin proceso se recupera. No duplica: un contrato
    tiene como máximo una renovación no cancelada, y cada orden tiene una
    clave de idempotencia derivada de sus contratos.
  - El contrato nuevo empalma con el anterior y termina en su día de
    vencimiento, con el tramo si no estaba alineado (4.2.1). Modos 0 y 2: `PEND_PAGO` con las
    fechas ya fijadas (al pagar se conservan) y el anterior prorrogado durante
    la tolerancia. Modo 1: `PEND_PAGO_ACTIVO` hasta su inicio + tolerancia.
    Modo 3: `PEND_PAGO_ACTIVO`
    sin límite.
  - El cliente puede desactivar la renovación automática de cada paquete desde
    el portal hasta que se genere la orden; después, hay que cancelarla.
- **Renovación manual** desde los vencimientos del portal: el cliente renueva
  un paquete vigente antes de la generación automática (o aunque la haya
  apagado), eligiendo la duración (por ejemplo, de mensual a anual). Va al
  carrito como renovación: misma cantidad, precio de renovación, bonificación
  recurrente propagada, sin ticket y con los medios de pago habilitados para
  renovación si el carrito es solo de renovaciones. Las fechas empalman con el
  vencimiento. Si mientras estaba en el carrito se generó la renovación
  automática, la confirmación la rechaza: nunca hay dos renovaciones de un
  contrato. Un paquete ya vencido no se renueva: se contrata de nuevo. El
  plan trimestral no se ofrece al renovar, y el trimestre inicial no se renueva
  desde el portal (se negocia).
  - Propaga la bonificación **solo si es recurrente**, aplicada sobre el precio de
    renovación vigente.
  - Medio de pago: el de renovación del cliente.
  - Agrupa en una orden por (cliente de facturación, período) si es planilla,
    con las altas a grupo pendientes de ese cliente de facturación; si no, una
    orden por empresa.
  - Si hay suscripción de MercadoPago y el monto cambió, lo actualiza **antes**
    de la fecha de cobro.
  - No consolida vencimientos automáticamente. Un contrato marcado **"no
    renovar"** se omite.
- **Tickets:**
  - **El ticket como saldo:** porcentaje con tope (0 = sin tope). El tope se
    consume en toda la serie: la orden donde se aplica y las renovaciones
    automáticas que la siguen heredan el ticket **sin revalidarlo** durante
    12 meses desde la orden de origen, mientras quede saldo
    (tope − lo descontado en la serie, sin las canceladas). El último período
    aplica el remanente. Reemplaza la regla anterior de "solo paquetes nuevos".
    La herencia no aplica a órdenes agrupadas ni a las que mezclan series.
  - Validación al aplicarlo a mano (carrito u orden manual), en este orden:
    activo y vigente; público o aplicado por SOFTeam; no en la factura
    agrupada (modo 3); ningún paquete bonificado (en ninguno de los dos
    sentidos); misma moneda; país del ticket (si tiene); cliente nominado (si
    tiene); paquetes habilitados (todos los ítems deben serlo); instancias
    habilitadas (primer alta, adicional, renovación); subtotal mínimo; usos y
    saldo.
  - **Usos:** una vez por cliente, una sola vez en total o varias (con máximo
    opcional). Cuentan solo las órdenes manuales no canceladas: la serie de
    renovaciones es el mismo uso. Una orden pendiente lo bloquea; cancelada,
    lo libera.
  - Un solo ticket por orden.
  - **Ticket nominado:** Administración lo crea para un cliente, con
    observaciones obligatorias. El carrito del cliente lo propone en su próxima
    compra y el cliente puede quitarlo.
- **Orden manual de SOFTeam —
 ** Administración la arma desde la ficha del cliente
  (*Orden manual*), con la misma cotización que el carrito y además: paquetes
  privados; bonificación por paquete con motivo (recurrente o no); cualquier
  medio de pago habilitado para el país, el modo y el emisor, sin las marcas
  de instancia; tickets no públicos; el emisor de la orden; la "fecha desde"
  de un alta a grupo; y la **renovación negociada del trimestre inicial**
  (elige mensual o anual y el día de vencimiento, y cobra el tramo más el
  período). Un **consumible bonificado al 100 %** permite editar las unidades
  de su saldo, exige motivo y nace sin renovación automática ni bonificación
  recurrente: la orden queda pagada en el acto, sin link ni factura. La grilla
  *Para negociar* enlaza cada trimestre con su orden manual.
- **Orden agrupada** (planilla): solo la ven el cliente agrupador y los roles
  SOFTeam. En "Mis paquetes" del cliente agrupado aparece como "Incluido en
  facturación corporativa".
- **Paquetes privados:** solo visibles y vendibles para roles SOFTeam. El filtro
  se aplica en el servidor y en la API, no solo en la pantalla.
- **Paquetes recomendados** (`destacado`): Administración los marca en el
  paquete; el catálogo del cliente los muestra primero y resaltados. El cliente
  no ve el código interno ni el tipo (la pestaña ya lo dice) y puede filtrar
  por producto. Cada alternativa de varios meses muestra su precio mensual
  equivalente y, si el paquete también se vende por mes, el ahorro redondeado
  a puntos enteros (`src/domain/catalogo/comparacion.ts`).

---

## 7. Procesos programados (todos idempotentes)

Cada corrida se registra en `job_run` con clave única (tipo de trabajo + fecha o
período). Reejecutar un día no duplica nada.

| Proceso | Frecuencia | Qué hace |
|---|---|---|
| Diario | 06:00 (después de la renovación) | Vence las excepciones de pago (`PEND_PAGO_ACTIVO` con fecha pasada → `PEND_PAGO`). Genera alertas (vencimiento 15, 7 y 1 día, saldo bajo 20 %, plazo de pago por vencer, licencia vencida, **empresa sin paquete vigente**, **renovación a negociar** para SOFTeam, una por trimestre desde el mes de su vencimiento). No emite alertas de vencimiento si hay renovación automática. |
| Renovación | Días de corte | Sección 6 |
| Entrega de eventos | Continuo, con reintentos | Envía webhooks desde el outbox, con reintento y backoff |
| Recordatorios de cobro | Configurable (10, 20 y 28) | Avisos de órdenes impagas y semáforo de antigüedad (10 y 21 días) |

**Tablero de SOFTeam al ingresar.**
Cajas con contador que abren la grilla de cada caso: renovaciones a negociar
(trimestres que vencen hasta fin de mes o ya vencidos, con semáforo: rojo
vencido, amarillo dentro de `tablero.dias_semaforo` días, verde el resto),
altas a grupo pendientes (se pueden anular), órdenes pendientes de pago,
errores de pago y empresas con consumibles agotados en los últimos 7 días.
Grilla en *Panel SOFTeam → Para negociar*.

**Aviso en el inicio del portal.** Con los mismos parámetros que las alertas
(`alertas.vencimiento_dias`, primer valor, y `alertas.saldo_bajo_porcentaje`),
el inicio muestra arriba de todo lo que pide atención: paquetes que vencen
dentro de esa anticipación **sin** renovación automática (ni renovación ya
generada), y cupos o saldos bajos o agotados. Sin nada pendiente, no aparece.
Las barras de uso muestran lo que queda y se pintan con el mismo criterio
(normal, bajo, agotado). Regla en `src/domain/licencias/atencion.ts`.

---

## 8. Seguridad

- **Autenticación** con Better Auth: email y contraseña, verificación del email
  por código (OTP), 2FA opcional para roles SOFTeam y sesiones en base de datos.
- **Autorización** por rol y alcance. Roles SOFTeam: `SOPORTE`, `COMERCIAL`,
  `ADMINISTRACION`. Roles del cliente por empresa: `ADMIN_GENERAL`,
  `ADMIN_COMERCIAL` (paquetes y pagos), `ADMIN_OPERATIVO` (configuración), más
  administradores delegados por oficina.
  - Se verifica en el servidor en cada acción. Nunca solo en la pantalla.
  - El menú muestra solo lo que el rol o permiso habilita; cada página y cada
    acción lo vuelven a exigir (403 si no corresponde).
  - El rol SOFTeam se lee de la base en cada request (no de la cookie de
    sesión): un cambio de rol o una baja rigen en el acto, y la baja cierra
    sus sesiones.
  - Nadie se quita permisos a sí mismo; siempre queda al menos un
    administrador general por empresa y una persona de Administración en
    SOFTeam. Solo un administrador general da o quita permisos.
  - Un mismo mail no puede ser a la vez de SOFTeam y administrador de un
    cliente (los paneles son excluyentes).
- **Invitaciones:** dar permisos a alguien sin usuario crea uno sin
  contraseña y le envía un enlace; la persona recibe un código y elige su
  contraseña (eso verifica el mail). El mismo flujo sirve para "olvidé mi
  contraseña", que responde igual exista o no el mail. Cambiar la contraseña
  cierra las demás sesiones.
- **Multi-cliente:** toda consulta del portal se filtra por las empresas del
  usuario, en una capa de acceso a datos central.
- **API para productos:** cada sistema tiene su clave. Las peticiones van firmadas
  con HMAC-SHA256 sobre método, ruta, timestamp y hash del cuerpo, con una
  ventana anti-replay de 5 minutos. Los webhooks de salida se firman igual.
- **Validación con Zod** en todos los bordes: formularios, acciones y API.
- **Auditoría** de cambios sensibles: precios, bonificaciones, fechas, estados,
  roles. Actor, antes y después, y motivo.
- Rate limiting en la API (por sistema y minuto) y en las acciones públicas
  de ingreso, alta y códigos por mail, por IP y por mail: ingreso 20/min por
  IP y 10 cada 15 min por mail; envío de códigos 3 cada 10 min por mail y 10
  por IP; verificación de códigos y segundo factor 10/min por IP; alta 5 cada
  10 min por IP. Los reenvíos de invitaciones y de links de pago, 3 por hora
  al mismo destino. Headers de seguridad y CSP. Secretos
  solo en variables de entorno validadas al arrancar.

---

## 9. Integraciones

- **API de productos (`/api/v1`):**
  - licencias consolidadas por empresa, con desglose por oficina;
  - estructura completa de la empresa versionada (`EmpresaFull` v1);
  - lista de empresas modificadas desde una fecha y hora;
  - consumo de notificaciones y cotizaciones;
  - contrato documentado en OpenAPI.
- **Webhooks de sincronización:** cada cambio en una empresa o en sus datos
  relacionados actualiza su fecha de modificación y encola un evento en el
  outbox, **en la misma transacción**. Los productos reciben
  `empresa.actualizada` con la empresa y la fecha, y la vuelven a leer.
- **Pasarela de pago (interfaz propia):** la app no depende de Mercado Pago.
  Implementaciones: Mercado Pago (se activa con `MERCADOPAGO_ACCESS_TOKEN` y
  `MERCADOPAGO_WEBHOOK_SECRET`) y un simulador (solo fuera de producción).
  - El link de pago se crea una vez por orden y se reutiliza (los importes
    están congelados).
  - El aviso (`POST /api/pagos/aviso`) se valida con la firma de la pasarela
    y el estado se **consulta** a la pasarela: no se confía en el aviso.
  - Aplicar un pago es idempotente y bloquea la orden. Un pago aprobado con
    importe o moneda distintos, o sobre una orden pagada o cancelada, no
    activa nada: queda "a revisar" y avisa a SOFTeam.
- **Facturación (interfaz propia):** comprobante al cobrarse la orden, al
  cliente de facturación. La emisión se reserva para no facturar dos veces;
  si falla, la reintenta el proceso diario. Adaptador de Xubio pendiente;
  simulador en desarrollo. A Xubio se informa la condición congelada en la
  orden (por su código ARCA), no la actual del cliente. Las órdenes sin
  importe no se facturan.
- **Emisores:** SOFTeam factura
  desde más de una sociedad. Administración las carga en *Panel SOFTeam →
  Emisores*: razón social, CUIT, condición (Responsable Inscripto o Gran
  Contribuyente), domicilio, país, punto de venta, preferido (uno por país) y
  sus conexiones. Cada emisor tiene su propia cuenta de Xubio y de Mercado
  Pago; los secretos se guardan cifrados (AES-256-GCM), no se muestran ni se
  auditan. Con la conexión marcada y sin credenciales propias se usan las
  del entorno (o los simuladores fuera de producción).
  - El cliente nuevo recibe el emisor preferido de su país; solo
    Administración lo cambia, y se le recuerda darlo de alta en el Xubio y el
    Mercado Pago del nuevo emisor. Sin emisor asignado rige el preferido; sin
    ninguno activo no se puede vender (`SIN_EMISOR`).
  - La orden congela el emisor con su CUIT y su razón social. El link de pago
    se crea en la cuenta de Mercado Pago del emisor y su aviso llega con el
    emisor, para validarlo con su clave. La factura se emite en su Xubio.
  - Sin Mercado Pago no se ofrecen el link ni la suscripción. Sin Xubio, la
    factura se emite fuera del sistema y Administración registra su número
    (`A-0001-00001234`) y su fecha en la orden.
  - Historial facturado en la ficha del cliente: sus órdenes facturadas con el
    emisor, el comprobante y el importe.
  - Separación de órdenes: una orden por cliente de facturación,
    empresa y medio de pago (la orden agrupada mezcla empresas); se cumple con
    el carrito de una empresa y un medio y con la agrupación de la
    renovación.
- **Email:** Resend + React Email (alertas, links de pago, verificación).

---

## 10. Arquitectura técnica

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19 con React Compiler |
| Lenguaje | TypeScript en modo estricto |
| UI | Tailwind CSS 4 + shadcn/ui, TanStack Table |
| Datos | PostgreSQL + Drizzle ORM. **PGlite** (Postgres embebido) para desarrollo y tests, sin instalar nada. Neon en producción |
| Validación | Zod 4 |
| Auth | Better Auth |
| Tests | Vitest (dominio y base de datos real con PGlite) + Playwright (flujos) |
| Calidad | Biome (lint + formato), TypeScript estricto, CI |
| Deploy | Vercel (app + cron) + Neon |

Estructura del código (monolito modular):

```
src/
  domain/        reglas puras, sin I/O: dinero, cálculo de orden, vigencia, consumos, tickets
  server/
    db/          esquema Drizzle, cliente, migraciones
    modules/     casos de uso por módulo (cuentas, catalogo, licencias, consumos, ordenes, cobros)
    auth/        sesión, roles, autorización
    jobs/        procesos programados
    integrations/ mercadopago, xubio, email, webhooks
  app/           rutas: (portal) cliente, (admin) SOFTeam, api/v1 productos
  components/    UI
```

Regla de dependencias: `domain` no importa nada del resto.
`server/modules` usa `domain` y `db`. `app` solo llama a `server/modules`.

---

## 11. Funcionalidades

1. **Base:** proyecto, dominio con tests, esquema de datos, auth y roles, layout.
2. **Catálogo y cuentas:** paquetes y alternativas (ABM), medios de pago,
   clientes y empresas (consulta), oficinas y canales, alta en línea con
   verificación del mail, portal del cliente.
   Edición de los datos del cliente (fiscales, domicilios, contactos, grupo,
   medios de pago, notas) y de la empresa desde SOFTeam, con control de
   concurrencia y auditoría; el CUIT y las bajas, solo Administración.
3. **Compra:** carrito persistente, checkout con cálculo completo (medio de
   pago, IVA, ticket), confirmación transaccional e idempotente, vista de
   orden, registro de pago y cancelación desde SOFTeam. El carrito puede
   mezclar paquetes temporales y consumibles. Compra delegada: un
   administrador de oficina tiene su propio carrito y los contratos quedan
   asignados a su oficina (también sus renovaciones, en una orden aparte).
   Facturación a otro cliente: SOFTeam (Administración o Comercial) asigna a
   una oficina un cliente de STLic activo; sus compras y renovaciones se le
   facturan con su comprobante, salvo planilla de un grupo económico. Si ese
   cliente se desactiva, se vuelve a facturar a la empresa. El pedido desde el
   portal (la empresa lo pide y SOFTeam lo aprueba o rechaza) está hecho pero
   apagado por parámetro hasta confirmar el caso (ver 4.3, "A quién se factura").
   Renovación manual desde los vencimientos del portal (ver sección 6).
   Bonificación de paquetes por SOFTeam (Administración o Comercial): sobre una
   orden pendiente sin ticket, un porcentaje por paquete con motivo; la orden se
   recalcula volviendo a tomar la foto fiscal, el link de pago se invalida y queda auditado. Si es recurrente, la renovación la conserva; 0 %
   la quita.
4. **Licencias y consumos:** API firmada (HMAC-SHA256, anti-replay) con
   listado de sincronización, EmpresaFull v1, licencia vigente y consumos
   idempotentes; secretos cifrados (AES-256-GCM); webhooks por outbox con
   reserva de lotes, envío en paralelo y reintentos; contrato OpenAPI;
   pantalla de Integraciones.
   Límite de pedidos por sistema: ventana de un minuto contada en
   la base (vale para todas las instancias), 600 por defecto y ajustable en
   Integraciones; al superarlo, 429 con `Retry-After` y cabeceras
   `RateLimit-*`. La pantalla muestra el uso de la última hora.
5. **Configuración de la empresa y perfiles:** usuarios de la empresa con
   accesos a productos y permisos de administración (invitación por mail),
   aseguradoras e interfaces con baja al mes siguiente, productores con sus
   códigos, políticas, límites de la licencia al activar; usuarios SOFTeam por
   rol, menú según rol o permiso, pantalla de auditoría, recuperación de la
   contraseña, catálogo de aseguradoras editable por SOFTeam (interfaces
   disponibles y discontinuación: quien ya trabaja con una discontinuada la
   conserva hasta darla de baja). Administradores delegados por canal u
   oficina: ven y gestionan solo usuarios, productores, oficinas, paquetes,
   órdenes y consumos de su alcance; lo que es de toda la empresa
   (aseguradoras, políticas, marca) queda para quien administra toda la
   empresa. El administrador general siempre tiene toda la empresa; un
   delegado de canal elige para cuál de sus oficinas compra. Soporte y avisos
   también respetan el alcance: el pedido queda en el canal u oficina de
   quien lo abre (y una oficina consume primero su crédito); el delegado ve
   los avisos de contratos y órdenes de sus oficinas y las respuestas a sus
   pedidos. Verificación en dos pasos para SOFTeam (opcional, con aviso en el
   tablero): app de autenticación (TOTP) con QR, 10 códigos de respaldo de un
   solo uso, "confiar en este dispositivo" 30 días, bloqueo de 15 minutos tras
   5 códigos incorrectos; Administración puede quitársela a quien perdió el
   celular (cierra sus sesiones y queda auditado).
6. **Procesos:** proceso diario (excepciones de pago vencidas, alertas de
   vencimiento, licencia vencida, saldo bajo o agotado, plazo de pago, empresa
   sin paquetes, límite excedido y aviso anticipado de que la licencia va a
   quedar por debajo de lo configurado), renovación quincenal, recordatorios de
   cobro, envío de avisos por mail, pantalla de procesos y alertas, avisos y
   renovación automática sí/no en el portal. Todo idempotente y registrado en
   `job_run`.
7. **Cobro:** interfaz propia de pasarela y de facturación, con simulador
   para desarrollo; adaptador de Mercado Pago (Checkout Pro y notificaciones
   firmadas); link de pago reutilizable, avisos de pago idempotentes (pago
   rechazado, reintento, importe distinto a revisión), reenvío del link,
   facturación automática con reintento diario, tickets (alta en el panel),
   orden agrupada visible para el cliente que factura.
   Adaptador de Xubio (API 1.1): token OAuth2, cliente por código de Xubio o
   CUIT (lo crea si no existe), factura al contado con `externalId` por orden
   (idempotente) y pedido del CAE; se activa con las variables `XUBIO_*`.
8. **Pulido:**
   - **Reportes** para SOFTeam (cobranza por mes, órdenes impagas por
     antigüedad, vencimientos con estado de renovación, consumos, empresas por
     producto, ventas por paquete, soporte) y **exportación a Excel** (CSV con
     ";" y BOM; protegido contra inyección de fórmulas) de reportes y listados,
     también en el portal (órdenes y consumos).
   - **Marca blanca** (la marca del cliente en los productos): nombre comercial, logo (PNG/JPEG/WebP validado por su
     contenido, hasta 300 KB), colores con control de contraste, textos y
     contacto, con vista previa. Los productos la reciben en EmpresaFull_V1 y
     el logo en `/api/v1/empresas/{numero}/logo` (con ETag).
   - **Tickets de soporte** ("atención de incidentes"): el cliente abre
     pedidos que consumen un ticket de su licencia (cupo mensual y después
     saldo). Las consultas sobre
     la propia cuenta (producto `stlic`: licencias, pagos y facturación) no
     consumen ticket, así un cliente sin tickets igual puede consultar
     (`src/domain/soporte/tickets.ts`); el portal suma una página de Ayuda con
     preguntas frecuentes de uso y acceso directo a esas consultas. Soporte los atiende desde una bandeja, con
     notas internas, asignación y estados; el cliente recibe aviso y mail de
     cada respuesta.
   - **Notas de SOFTeam** por empresa (las líneas que empiezan con "*" no las
     ve el cliente) e **histórico de actividad** de cada empresa, a partir de
     la auditoría.
   - **Adjuntos en soporte:** imágenes (PNG, JPG, WebP) o PDF,
     validados por su contenido; hasta 3 por mensaje, 2 MB cada uno y 3,5 MB
     entre todos. Se guardan en la base con el mensaje; el cliente ve los de
     su pedido (nunca los de una nota interna) y SOFTeam todos. Se sirven con
     `nosniff` y política de contenido restrictiva; el PDF se descarga.
9. **Migración y administración:**
   - **Importación de datos** (*Panel SOFTeam → Importar datos*, solo
     Administración): clientes y empresas (conserva el número de empresa),
     canales y oficinas, usuarios, productores, códigos por compañía y
     catálogo de aseguradoras (`Aseguradoras`). Las aseguradoras con las que
     trabaja cada empresa (`STLicAseguradoras`) no se importan: las elige la
     empresa en *Portal → Aseguradoras*. Formato fijo: primera línea con los
     nombres de los campos (atributos de SOFTeam o nombres de STLic) y los valores debajo, todo separado por ";"; un
     archivo con comas o tabuladores se rechaza entero. UTF-8 o Windows-1252.
     La pantalla trae un manual: el formato, el orden de importación y, para
     cada tipo, la tabla de SOFTeam, la consulta y cómo exportarla (PowerShell
     o Excel). Primero se revisa (sin
     guardar) y después se importa todo o nada; plantilla por tipo y mail de
     acceso opcional a los administradores nuevos.
   - **Alta de cliente por SOFTeam** (cliente, empresa, oficina inicial y
     administrador) y **nueva empresa** para un cliente existente.
   - **Grupos económicos**: alta, edición, cliente principal, cliente de
     facturación consolidada, miembros y baja del grupo vacío.
   - **Oficinas y canales**: edición de datos y redes, desactivación
     (conservando una activa; un delegado de oficina no desactiva la suya),
     renombrar canales y si cada oficina envía notificaciones (la política de
     la empresa es el interruptor general; va en EmpresaFull).
   - **Baja de un contrato** activo por Administración, con motivo.
   - **Parámetros del sistema** editables por Administración (Soporte los
     ve), validados y auditados, y **factores de los medios de envío**
     (créditos por envío; el mail no se desactiva).
   - **Bonificación de paquetes** por SOFTeam en órdenes pendientes (ver
     punto 3).
   - **Movimientos de saldo de un contrato** para SOFTeam, con el saldo
     después de cada movimiento.
   - **Exportaciones** de aseguradoras y paquetes (SOFTeam) y de usuarios,
     productores y códigos (portal, con los títulos de la importación).
   - **Tipos de comunicación:** cada empresa define sus comunicaciones con
     los medios (aviso del sistema, aviso en el portal, mail, SMS, push,
     WhatsApp) y, por tipo de usuario que la origina, a quiénes llega y quién
     la autoriza. Los tipos de usuario conservan el código de SOFTeam (1
     SOFTeam, 7 administrador de empresa, 3 productor, 5 asegurado…). Los
     productos las reciben en EmpresaFull (`comunicaciones`).
   - **Países, monedas y provincias** (configurables, para varios países): *Panel SOFTeam → Países y monedas*. Monedas con
     cotización en pesos (el peso es la base), países con su moneda e IVA
     general, provincias por país. Los domicilios y la importación validan la
     provincia contra la base. El código de una
     provincia nueva lo genera el sistema a partir del nombre (iniciales o
     primeras letras, único dentro del país; `src/domain/catalogo/provincias.ts`)
     y no cambia al renombrarla; las ya cargadas conservan el suyo.
   - **Recibo provisorio** de cada orden pagada (portal y SOFTeam), imprimible
     o para guardar en PDF: constancia del pago con el detalle de la orden,
     numerado con la orden ("R-10025"). No es comprobante fiscal: la factura
     se emite según el modo de facturación (4.6).

## 12. Pendientes

- **Mercado Pago:** probar contra su sandbox; suscripción con débito
  automático y actualización de su monto antes de cada cobro (el medio está
  desactivado y las renovaciones se pagan con link o transferencia).
- **Xubio:** probar con una cuenta real.
- **Emisores:** cambiar el emisor de una orden ya emitida (hoy se cancela y se
  vuelve a generar) y controlar las suscripciones activas al cambiar el emisor
  del cliente.
- **Marca blanca** en los mails de STLic.
- **Venta fuera de Argentina:** identificación fiscal y facturación de cada
  país.
