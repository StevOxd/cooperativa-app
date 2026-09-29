# Correcciones al sistema

Registro de errores y mejoras encontrados durante el rediseño del frontend (rama `feat/rediseno-ui`). Estos puntos **no forman parte del rediseño**, porque tocan lógica, validaciones, backend o infraestructura. Cada uno se corrige en su propio commit (`fix(...)`), para que el rediseño siga siendo solo visual.

**Cómo usar este archivo**
- Al corregir un punto, cambie su estado a **Corregido** y anote el commit.
- Si aparece un error nuevo, agréguelo con el siguiente número (`C-15`, `C-16`…).
- Prioridad: **Alta** = afecta seguridad o bloquea al usuario · **Media** = el usuario lo nota o confunde · **Baja** = limpieza o rendimiento.

## Resumen

| ID | Problema | Área | Prioridad | Estado |
|---|---|---|---|---|
| C-01 | La app se muestra detrás del cambio obligatorio de contraseña | Frontend · sesión | Alta | **Corregido** |
| C-02 | "Mi cuenta" pide 6 caracteres, pero el backend exige 8 y un símbolo | Frontend · validación | Alta | **Corregido** |
| C-03 | El recorrido guiado hay que cerrarlo dos veces | Frontend · asociado | Media | **Corregido** |
| C-04 | Docker Compose no lee `docker.env` con el comando del README | Infraestructura | Media | Pendiente |
| C-05 | El recorrido guiado promete funciones que no existen | Contenido | Media | **Corregido** (Fase 3.4, grupo 3a) |
| C-06 | Mensajes del backend y de los handlers con jerga técnica | Contenido | Media | **Corregido** (Fase 3.5) |
| C-07 | Sin proxy de WebSocket en el servidor de desarrollo | Frontend · desarrollo | Baja | Por verificar |
| C-08 | Contraseña `'admin123'` como valor por defecto que no se usa | Frontend y backend | Baja | Pendiente |
| C-09 | Modales montados que nada abre | Frontend | Baja | Pendiente |
| C-10 | Clases de animación que no existen | Frontend | Baja | **Corregido** |
| C-11 | El paquete de JavaScript supera los 500 kB | Frontend · rendimiento | Baja | Pendiente |
| C-12 | Los KPI del administrador no cuentan a los ejecutivos | Frontend · admin | Baja | Pendiente |
| C-13 | Variables sin uso tras separar los dashboards | Frontend | Baja | Pendiente |
| C-14 | Mismo texto de error de credenciales en el backend para todos los casos | Backend · contenido | Baja | **Corregido** (Fase 3.5) |
| C-15 | Si el correo falla, la afiliación se completa igual y el asociado no recibe su contraseña | Backend · correo | Alta | Pendiente |
| C-16 | Contraseñas temporales y secretos 2FA en los registros y en memoria | Backend · seguridad | Alta | Pendiente |
| C-17 | Los traslados que entran a una cuenta se muestran como egreso en los movimientos | Frontend · asociado | Media | Por verificar |
| C-18 | El comprobante de apertura de cuenta sale con datos de ejemplo y se descarga dos veces | Frontend · operador | Alta | Pendiente |
| C-19 | Los productos de ahorro del operador están escritos a mano | Frontend · operador | Media | Pendiente |
| C-20 | El operador y el asociado guardan el parentesco con valores distintos | Frontend y backend | Media | Pendiente |
| C-21 | Suspender o activar un asociado no actualiza la lista ni avisa | Frontend · operador | Alta | **Corregido** |
| C-22 | El correo de prueba en modo demostrativo se anuncia como "Operación exitosa" | Frontend · admin | Baja | Pendiente |
| C-23 | En la afiliación en línea, la contraseña que define el cliente del banco se descarta o se envía por correo | Backend · afiliación | Alta | Pendiente |
| C-24 | El código QR de 2FA que muestra la afiliación no sirve y expone el secreto | Backend · seguridad | Alta | Pendiente |
| C-25 | Una contraseña bancaria incorrecta en la afiliación manda a la pantalla de inicio de sesión | Backend · afiliación | Alta | **Corregido** |
| C-26 | Crear un usuario o reiniciar su contraseña muestra dos avisos iguales | Frontend · admin | Baja | **Corregido** |
| C-27 | Al editar un usuario, el administrador puede fijarle una contraseña que no expira | Backend y frontend · seguridad | Media | **Corregido** |
| C-28 | Desistir de un crédito lo guarda como "rechazado" | Backend · créditos | Media | Pendiente |
| C-29 | El servidor no valida el monto ni el plazo mínimo y máximo de un crédito | Backend · créditos | Baja | Pendiente |
| C-30 | La afiliación en línea revelaba el usuario del administrador | Backend · seguridad | Media | **Corregido** (Fase 3.5) |
| C-31 | El aviso de intentos restantes permite saber si una cuenta existe | Backend · seguridad | Media | Pendiente |
| C-32 | Un rol desconocido ve el panel del administrador | Frontend · sesión | Baja | Pendiente |

---

## Pendientes

### C-01 · La app se muestra detrás del cambio obligatorio de contraseña
**Prioridad:** Alta · **Corregido:** `Layout` no monta la aplicación mientras `debe_cambiar_password` sea verdadero; muestra un fondo neutro con la marca y encima el modal. Probado: no se ve el portal, no se abre el recorrido y no sale ninguna petición además de `/auth/me`.

**Qué pasa:** cuando un asociado nuevo entra por primera vez con su contraseña temporal, aparece el modal "Cambie su contraseña", pero detrás ya se ve el portal (dashboard, pestañas, menú), como si la sesión estuviera completa. Además, el recorrido guiado de bienvenida se abre detrás del modal.

**Causa (verificada):**
- El login guarda el token y el usuario en cuanto las credenciales son correctas, y `LoginPage` navega a `/dashboard` sin revisar `debe_cambiar_password` ([LoginPage.jsx:93](frontend/src/pages/LoginPage.jsx#L93) y [:124](frontend/src/pages/LoginPage.jsx#L124)).
- `AuthContext` solo pone el modal encima del contenido ([AuthContext.jsx:284](frontend/src/context/AuthContext.jsx#L284)), y el `Layout` sigue dibujando la aplicación completa.

**Lo que sí funciona:** el backend bloquea la API. Mientras `debe_cambiar_password` sea verdadero, [authMiddleware.js:76](backend/src/middlewares/authMiddleware.js#L76) responde 403 a todo, salvo `/auth/cambiar-password`, `/auth/me` y `/auth/logout`. No se filtran datos, pero la pantalla dispara peticiones que fallan y da la impresión de que ya entró.

**Propuesta:** mientras `user.debe_cambiar_password` sea verdadero, no montar el `Layout` ni las rutas privadas. Se muestra una pantalla neutra (fondo liso con la marca, como el login) y encima el modal. Opciones:
1. En `ProtectedRoute` o `Layout`, si `user?.debe_cambiar_password`, devolver solo un fondo vacío en lugar de `<Outlet />`.
2. O en `LoginPage`, no navegar a `/dashboard` cuando `result.user.debe_cambiar_password` sea verdadero.

La opción 1 es más segura: cubre también el caso en que el usuario recarga la página.

**Cómo verificar:** entrar con un usuario que tenga contraseña temporal. Detrás del modal no debe verse el portal, y en la pestaña Red del navegador no debe haber peticiones con 403.

---

### C-02 · "Mi cuenta" pide 6 caracteres, pero el backend exige 8 y un símbolo
**Prioridad:** Alta · **Corregido:** las reglas viven en [utils/passwordPolicy.js](frontend/src/utils/passwordPolicy.js), con la misma expresión que el backend, y las usan el cambio obligatorio y "Mi cuenta". Probado: `abc123` y `abc12345` se bloquean con su mensaje; `Abc#1234` se envía.

**Qué pasa:** las reglas de contraseña no coinciden entre pantallas:

| Lugar | Mínimo | Letras y números | Símbolo |
|---|---|---|---|
| Backend `/auth/cambiar-password` ([authController.js:451](backend/src/controllers/authController.js#L451)) | 8 | Sí | **Sí** |
| Cambio obligatorio ([ForcedPasswordChangeModal.jsx:28](frontend/src/components/auth/ForcedPasswordChangeModal.jsx#L28)) | 8 | Sí | Sí |
| Mi cuenta → Contraseña ([AccountSettingsModal.jsx:239](frontend/src/components/profile/AccountSettingsModal.jsx#L239)) | **6** | Sí | **No** |
| `ChangePasswordModal` (legado, no se usa) | 8 | — | — |

En "Mi cuenta", el usuario escribe una contraseña de 6 caracteres, la lista de requisitos se pone en verde y, al guardar, el servidor la rechaza con un error. No es un riesgo de seguridad, porque el backend no la acepta, pero el formulario engaña al usuario.

**Propuesta:** en `AccountSettingsModal`, igualar la validación y la lista de requisitos a la del backend: 8 caracteres, letras, números y un símbolo. Lo ideal es sacar las reglas a un solo módulo (por ejemplo `utils/passwordPolicy.js`) que usen los dos modales, para que no vuelvan a separarse.

**Cómo verificar:** en Mi cuenta → Contraseña, "abc123" no debe habilitar el envío ni marcar los requisitos en verde.

---

### C-03 · El recorrido guiado hay que cerrarlo dos veces
**Prioridad:** Media · **Corregido:** el efecto se separó en dos: la apertura automática depende solo del usuario (`storageKey`) y la manual solo de `forceOpen` al pasar a `true`. Probado: se cierra con un clic y con Escape.

**Qué pasa:** en el portal del asociado, al pulsar "Recorrido" y luego cerrar la ventana, se vuelve a abrir. Hay que cerrarla una segunda vez.

**Causa (verificada):** en [AssociateOnboardingTour.jsx:87-99](frontend/src/components/associate/AssociateOnboardingTour.jsx#L87-L99), el `useEffect` depende de `forceOpen`:
1. "Recorrido" pone `showTour = true`, así que `forceOpen = true` y se abre.
2. Al cerrar se llama a `onCloseTour()`, que pone `showTour = false`.
3. Como `forceOpen` cambió, el efecto se vuelve a ejecutar. Si el asociado no marcó "no volver a mostrar", entra en la rama `!isDismissed` y **lo abre de nuevo**.

No son dos ventanas: es la misma, que se reabre.

**Propuesta:** separar los dos casos. La apertura automática debe ocurrir solo al montar o al cambiar de usuario; la apertura manual, solo cuando `forceOpen` pasa a `true`. Por ejemplo, en la rama de apertura automática, ignorar la ejecución que provoca `forceOpen` al volver a `false`, o mover la apertura manual a un efecto propio que dependa solo de `forceOpen`.

**Cómo verificar:** con un asociado que no haya marcado "no volver a mostrar": pulsar Recorrido y cerrar. Debe cerrarse con un solo clic.

---

### C-04 · Docker Compose no lee `docker.env` con el comando del README
**Prioridad:** Media

**Qué pasa:** el README indica `cp docker.env.example docker.env` y luego `docker compose up --build -d`. Pero Compose solo lee de forma automática un archivo llamado `.env`. Con ese comando, las variables de `docker.env` quedan vacías; se comprobó con `GMAIL_USER`, que en [docker-compose.yml:94-95](docker-compose.yml#L94-L95) se lee como `${GMAIL_USER:-}`. Resultado: el correo no funciona en Docker aunque `docker.env` esté lleno.

**Comprobación:** `docker compose config` muestra `GMAIL_USER: ""`, y `docker compose --env-file docker.env config` sí muestra el valor.

**Propuesta:** una de estas dos:
1. Agregar `env_file: docker.env` a los servicios que lo necesitan en `docker-compose.yml`.
2. O actualizar el README para usar siempre `docker compose --env-file docker.env …`.

Revisar también qué otras variables de `docker.env` se están perdiendo.

**Relación con C-15:** esta es la causa más probable de que, en Docker, el correo quede en "modo de prueba" aunque `docker.env` tenga las credenciales. Con las variables vacías, el servicio de correo no encuentra `GMAIL_USER` ni `GMAIL_APP_PASSWORD` y pasa al modo demo sin avisar.

---

### C-05 · El recorrido guiado promete funciones que no existen
**Prioridad:** Media

**Qué pasa:** los textos de [AssociateOnboardingTour.jsx](frontend/src/components/associate/AssociateOnboardingTour.jsx) describen cosas que el portal no tiene:
- "Puedes filtrar y revisar cada débito interbancario ACH con su respectivo identificador" (línea 52).
- Un simulador con "amortización decreciente sobre saldos (Sistema Alemán)" (línea 71). El simulador y el plan de pagos usan solo el sistema francés.
- "Tu sesión cuenta con cifrado institucional" (línea 81).
- "Automatiza tu ahorro programando traslados mensuales", pero los traslados son solicitudes individuales.

**Propuesta:** reescribir los 5 pasos con lo que el portal realmente hace. Se hará al rediseñar el recorrido (Fase 3.4), junto con la corrección de C-03.

---

### C-06 · Mensajes del backend y de los handlers con jerga técnica
**Prioridad:** Media · **Corregido** (Fase 3.5: se reescribieron unos 220 mensajes del frontend y 270 del backend en «usted», sin jerga ni «exitosamente». Quedan fuera los PDF (Fase 4), `AuthContext` (por regla no se toca: tiene 3 textos de respaldo como «Error al iniciar sesión») y los modales que nada abre (C-09))

**Qué pasa:** algunos mensajes que ve el usuario no los controla el diseño:
- Backend: *"[SECURITY ERROR] La sesión bancaria ha expirado…"*, *"Por motivos de seguridad institucional…"*.
- Handlers del frontend: *"Sesión cerrada por seguridad bancaria al regresar a la pantalla de acceso"* ([LoginPage](frontend/src/pages/LoginPage.jsx)).
- Mensajes de la consulta de DPI en [NewAssociateModal](frontend/src/components/associates/NewAssociateModal.jsx): *"Colaborador Bancario identificado en Core Banking (Planilla Corporativa)"* y *"Persona identificada como Afiliado Externo / Ajeno al Banco"*.
- Usted y tú mezclados en toasts y mensajes.

**Propuesta:** revisarlos en la Fase 3.5 (textos), con frases cortas en "usted". Los del backend requieren un commit en `backend/`.

---

### C-07 · Sin proxy de WebSocket en el servidor de desarrollo
**Prioridad:** Baja · **Por verificar**

**Qué pasa:** [vite.config.js:11](frontend/vite.config.js#L11) solo redirige `/api` al backend. Si el socket se conecta al mismo origen, con `npm run dev` las alertas en tiempo real (sesión concurrente, presencia) no llegarían. En Docker funciona, porque Nginx sí hace el proxy.

**Cómo verificar:** con `npm run dev`, abrir sesión con el mismo usuario en dos navegadores y ver si llega la alerta. Si no llega, agregar `'/socket.io': { target: 'http://localhost:5001', ws: true }` al proxy.

---

### C-08 · Contraseña `'admin123'` como valor por defecto que no se usa
**Prioridad:** Baja

**Qué pasa:**
- [OperatorDashboard.jsx:71](frontend/src/pages/OperatorDashboard.jsx#L71) guarda `passwordInicial = 'admin123'` y la sigue pasando al modal de afiliación. Desde la Fase 3.4 el modal ya no declara esa prop; falta quitar el estado y la prop en la página.
- [operadorAfiliacionService.js:172](backend/src/services/operadorAfiliacionService.js#L172) tiene `password_inicial = 'admin123'` como valor por defecto, pero la contraseña real se genera al azar con `generateSecureRandomPassword(12)`.

No es un riesgo hoy, pero es confuso y podría usarse por error en el futuro.

**Propuesta:** eliminar el estado y la prop en el frontend, y el valor por defecto en el backend.

---

### C-09 · Modales montados que nada abre
**Prioridad:** Baja

**Qué pasa:**
- `UpdateProfileModal` y `ChangePasswordModal` se montan en [useAccountActions.jsx](frontend/src/components/layout/useAccountActions.jsx), pero nada cambia su estado a abierto. "Mi cuenta" los reemplazó.
- `AdminDashboard` monta sus propios `GoogleEmailConfigModal` y `AccountSettingsModal` con estados que nunca pasan a `true`, porque la barra lateral ya tiene los suyos.

**Propuesta:** confirmar que no se usan y eliminarlos, junto con sus archivos si nadie más los importa.

---

### C-10 · Clases de animación que no existen
**Prioridad:** Baja · **Corregido** (la última, `animate-shake` en DashboardPage, se quitó en la Fase 3.5)

**Qué pasa:** 17 archivos usan clases como `animate-fadeIn`, `animate-scaleUp`, `animate-shake`, `animate-in`, `fade-in` y `zoom-in-95`. No existen en Tailwind 3 ni en `index.css`, así que no hacen nada.

**Propuesta:** se van quitando al rediseñar cada modal. Al terminar la Fase 3.4, buscar las que queden con `grep -rn "animate-fadeIn\|animate-scaleUp\|animate-shake\|animate-in" frontend/src`.

---

### C-11 · El paquete de JavaScript supera los 500 kB
**Prioridad:** Baja

**Qué pasa:** `npm run build` advierte que el paquete principal supera los 500 kB, porque todas las pantallas, Chart.js y jsPDF se cargan juntas.

**Propuesta:** cargar las pantallas por rol con `React.lazy` y dejar jsPDF solo donde se generan PDFs. Mejora la primera carga, sobre todo en celular.

---

### C-12 · Los KPI del administrador no cuentan a los ejecutivos
**Prioridad:** Baja

**Qué pasa:** el cálculo `kpis` de [AdminDashboard.jsx](frontend/src/pages/AdminDashboard.jsx) solo cuenta asociados, operadores y administradores. La tarjeta "Usuarios por rol" ya muestra los 4 roles, porque calcula por su cuenta, pero la línea de ayuda del KPI "Usuarios registrados" solo menciona asociados y operadores.

**Propuesta:** agregar `ejecutivosCount` al cálculo y revisar si hay otros lugares con la lista de roles incompleta.

---

### C-13 · Variables sin uso tras separar los dashboards
**Prioridad:** Baja

**Qué pasa:** al mover el JSX a subcomponentes quedaron sin usar, dentro de bloques de lógica que no se tocaron a propósito:
- `formatDateOnly` en `OperatorDashboard.jsx`.
- `user` en `ExecutiveDashboard.jsx`.
- `getStatusBadge` en `ExecutiveDashboard.jsx`: desde la Fase 3.4 el modal de resolución ya no la usa y la página tampoco.

**Propuesta:** limpiarlas en un commit de refactor cuando el rediseño termine.

---

### C-14 · Mismo texto de error de credenciales en el backend para todos los casos
**Prioridad:** Baja · **Corregido** (Fase 3.5: «El usuario o la contraseña no son correctos.». Ver C-31 sobre el conteo de intentos)

**Qué pasa:** el login responde *"Credenciales inválidas. Verifique su código corporativo/correo o contraseña."* Es correcto no decir cuál de los dos falló, por seguridad, pero el texto usa "código corporativo", un término que el asociado no conoce. En pantalla se le llama "código de usuario".

**Propuesta:** *"El usuario o la contraseña no son correctos."*

---

### C-15 · Si el correo falla, la afiliación se completa igual y el asociado no recibe su contraseña
**Prioridad:** Alta

**Qué pasa:** al formalizar una afiliación, el sistema genera la contraseña temporal y la envía por correo. Por la regla de seguridad, esa contraseña nunca se muestra en pantalla. Pero si el correo no sale, el backend responde como si todo estuviera bien:
- **Sin credenciales** (o no verificadas): [mailerService.js:562](backend/src/services/mailerService.js#L562) devuelve `{ success: true, simulado: true, provider: 'demo' }`.
- **El envío falla** (Gmail rechaza, sin red, etc.): [mailerService.js:558](backend/src/services/mailerService.js#L558) devuelve `{ success: true, simulado: true, error }`.

La afiliación queda formalizada y el asociado no tiene cómo entrar. El operador solo ve el aviso "El correo está en modo de prueba" en el resumen, y si lo cierra no queda registro en pantalla.

**Causas más probables del modo de prueba:**
1. En Docker, las variables de `docker.env` no se leen (**C-04**).
2. La configuración guardada desde "Correo de notificaciones" (tabla `configuracion_sistema`) no existe o falla la verificación con Google.

**Propuesta:**
- Que `success` refleje si el correo realmente salió (`success: false` cuando `simulado` es verdadero fuera del entorno de desarrollo), o que la respuesta de formalizar incluya un campo claro como `correo_enviado: false`.
- En el resumen de la afiliación, si el correo no salió, mostrar un aviso que no se pueda pasar por alto y dar una salida: reenviar las credenciales o generar una nueva contraseña temporal. Ya existe un flujo de reinicio de contraseña (línea 673) que se puede reutilizar.
- Mostrar al administrador el estado del servicio de correo (`getStatus()` ya devuelve `verified` y `lastError`).

**Cómo verificar el correo, paso a paso:**
1. Levantar con `docker compose --env-file docker.env up -d` (mientras C-04 siga pendiente).
2. En los registros del backend (`docker compose logs backend | grep MAILER`) debe aparecer `[MAILER] Conectado y verificado exitosamente con Google Mail (...)`. Si dice `Credenciales de Google cargadas pero no verificadas`, revisar la contraseña de aplicación de 16 caracteres.
3. Como administrador, abrir "Correo de notificaciones" y usar la prueba de envío.
4. Formalizar una afiliación de prueba con un correo propio: debe llegar el mensaje y el resumen **no** debe mostrar "modo de prueba".

---

### C-16 · Contraseñas temporales y secretos 2FA en los registros y en memoria
**Prioridad:** Alta · **Seguridad**

**Qué pasa:** en modo de prueba, el servicio de correo escribe la contraseña temporal **en texto plano** en la consola del servidor:
- [mailerService.js:561](backend/src/services/mailerService.js#L561): `... (Usuario: ${codigoCorporativo}, Pass: ${password})` (credenciales de afiliación).
- [mailerService.js:673](backend/src/services/mailerService.js#L673): igual, para el reinicio de contraseña.

Además, el historial en memoria `lastEmails` guarda `passwordGenerada` ([línea 543](backend/src/services/mailerService.js#L543)) y el secreto del 2FA `secretBase32` ([línea 424](backend/src/services/mailerService.js#L424)) de los últimos 20 correos.

Cualquiera con acceso a los registros (`docker compose logs`, un servicio de logs, una captura de pantalla de la terminal) puede leer contraseñas temporales válidas. Con el secreto 2FA se puede generar el código de verificación de otra persona.

**Lo que se revisó:** el historial **no** se expone por ningún endpoint. `getLastSentEmails()` no la llama ningún controlador, y `getStatus()` no incluye el historial. El riesgo está en los registros y en la memoria del proceso.

**Propuesta:**
- Quitar `password` y cualquier secreto de todos los `console.log` / `console.warn`. Registrar solo destinatario, asunto y resultado.
- Quitar `passwordGenerada` y `secretBase32` del objeto `record`, o eliminar `lastEmails` si no tiene uso.
- Si se necesita probar sin correo real en desarrollo, usar un transporte de pruebas (por ejemplo Ethereal de Nodemailer), que da un enlace para ver el correo sin escribir secretos en consola.
- Tras corregirlo, revisar si en registros viejos quedaron contraseñas de usuarios que todavía no las han cambiado.

---

### C-17 · Los traslados que entran a una cuenta se muestran como egreso en los movimientos
**Prioridad:** Media · **Por verificar**

**Qué pasa:** en el modal de movimientos del asociado ([AccountMovementsModal.jsx](frontend/src/components/associate/dashboard/AccountMovementsModal.jsx)), un movimiento se considera ingreso (verde, con "+") solo si su tipo es `DEPOSITO` o `PAGO_CREDITO`. Esta regla viene del código original y no se cambió en el rediseño. Los tipos válidos en la base de datos son `DEPOSITO`, `RETIRO`, `TRANSFERENCIA`, `PAGO_CREDITO` y `AJUSTE` ([database.sql:290](backend/database.sql#L290)).

Un `TRANSFERENCIA` que **entra** a la cuenta (por ejemplo, un traslado aprobado desde la cuenta de planilla) o un `AJUSTE` a favor se mostrarían como egreso, con "−". Tampoco está claro si `PAGO_CREDITO` es dinero que entra (desembolso) o que sale (abono a un préstamo).

**Cómo verificar:** aprobar un traslado hacia una cuenta de ahorro y abrir los movimientos de esa cuenta. El traslado debe aparecer con "+".

**Propuesta:** decidir el signo por la dirección real del movimiento y no solo por el tipo. Por ejemplo, comparar `saldo_nuevo` con el saldo anterior, o que el backend envíe un campo `sentido: 'ENTRADA' | 'SALIDA'`. Confirmar también qué significa `PAGO_CREDITO`.

---

### C-18 · El comprobante de apertura de cuenta sale con datos de ejemplo y se descarga dos veces
**Prioridad:** Alta · **Por corregir**

**Qué pasa:** al abrir una cuenta en ventanilla, "Descargar comprobante" ([OpenAccountModal.jsx:174](frontend/src/components/associates/OpenAccountModal.jsx#L174)) pasa los datos agrupados (`{ asociado, cuenta, deposito }`), pero `generateAccountOpeningReceiptPdf` ([accountOpeningReceiptPdf.js](frontend/src/utils/accountOpeningReceiptPdf.js)) lee campos planos. El PDF muestra los valores de ejemplo: "CTA-AHORR-XXXXXX", "No especificado", "CASO-AFIL-XXXX".

Además, el generador ya llama a `doc.save()` ([accountOpeningReceiptPdf.js:315](frontend/src/utils/accountOpeningReceiptPdf.js#L315)) y el modal vuelve a guardar el documento, por lo que el navegador descarga el archivo dos veces.

**Cómo verificar:** abrir una cuenta desde Asociados y descargar el comprobante.

**Propuesta:** pasar los campos con los nombres que espera el generador y guardar el PDF en un solo lugar.

---

### C-19 · Los productos de ahorro del operador están escritos a mano
**Prioridad:** Media · **Por corregir**

**Qué pasa:** el modal de apertura de cuenta tiene la lista de productos, tasas y montos mínimos fija en el código (`TIPOS_PRODUCTO`, [OpenAccountModal.jsx:23](frontend/src/components/associates/OpenAccountModal.jsx#L23)). El portal del asociado los lee de `/catalogo/tipos-cuenta`. Si cambia una tasa o un mínimo en la base de datos, el operador sigue viendo los valores anteriores y los dos portales no coinciden.

**Propuesta:** leer el catálogo desde `/catalogo/tipos-cuenta` también en el modal del operador.

---

### C-20 · El operador y el asociado guardan el parentesco con valores distintos
**Prioridad:** Media · **Por corregir**

**Qué pasa:** el operador ofrece `HIJO/A, CONYUGE, PADRE/MADRE, HERMANO/A, SOBRINO/A, OTRO` ([BeneficiariesModal.jsx:34](frontend/src/components/associates/BeneficiariesModal.jsx#L34)) y el asociado `CÓNYUGE, HIJO/A, PADRE, MADRE, HERMANO/A, OTRO` ([EditBeneficiariesModal.jsx:6](frontend/src/components/associate/dashboard/EditBeneficiariesModal.jsx#L6)). Si uno guarda un valor que no existe en la lista del otro (por ejemplo "SOBRINO/A" o "CÓNYUGE" con tilde), el `<select>` del otro no lo encuentra y muestra la primera opción. Al guardar sin darse cuenta, el parentesco cambia.

En pantalla ya se muestran bien los dos juegos de valores ([utils/parentesco.js](frontend/src/utils/parentesco.js)). Lo que falta es unificar los valores que se guardan.

**Propuesta:** definir una sola lista (idealmente validada en el backend) y migrar los registros existentes.

---

### C-21 · Suspender o activar un asociado no actualiza la lista ni avisa
**Prioridad:** Alta · **Corregido** (`fix(asociados)`: se usa `const { toast } = useToast()`; tras confirmar se muestra el aviso y la lista se recarga)

**Qué pasa:** [AssociatesManagementPage.jsx:48](frontend/src/pages/AssociatesManagementPage.jsx#L48) hace `const toast = useToast()`, pero el contexto devuelve `{ toast, addToast, removeToast }`. Al confirmar el cambio de estado, el backend sí lo guarda, pero `toast.success` lanza "toast.error is not a function", la tabla no se recarga y el operador no recibe ningún aviso. Parece que no pasó nada, y puede volver a intentarlo, lo que revierte el cambio.

**Cómo verificar:** suspender a un asociado desde Asociados. En la consola aparece `TypeError: toast.error is not a function`.

**Propuesta:** `const { toast } = useToast();`, como en el resto de páginas. Es un cambio de una línea.

---

### C-22 · El correo de prueba en modo demostrativo se anuncia como "Operación exitosa"
**Prioridad:** Baja · **Por corregir**

**Qué pasa:** si no hay una cuenta de Google configurada, el backend responde `success: true` con `simulado: true`. El modal ya muestra "El correo no salió", pero el aviso flotante sigue diciendo "Operación exitosa" ([GoogleEmailConfigModal.jsx](frontend/src/components/admin/GoogleEmailConfigModal.jsx), `handleSendTest`).

**Propuesta:** usar `toast.warning` cuando la respuesta traiga `simulado`.

---

### C-23 · En la afiliación en línea, la contraseña que define el cliente del banco se descarta o se envía por correo
**Prioridad:** Alta · **Por corregir**

**Qué pasa:** en el paso "Su acceso al portal" el cliente del banco escribe una contraseña, pero `procesarAfiliacionExistente` ([afiliacionOnlineController.js:340](backend/src/controllers/afiliacionOnlineController.js#L340)) hace esto:
- **Si la persona no tenía usuario** (el caso normal), ignora esa contraseña: genera una aleatoria, la envía por correo y marca `debe_cambiar_password`. Si el correo falla (C-15), la persona no puede entrar.
- **Si ya tenía usuario**, guarda la contraseña elegida, pero también marca `debe_cambiar_password` y la envía **en texto plano** por correo (`password: usuarioFinal.passwordGenerada || password`).

Además, el frontend y el backend solo exigen 6 caracteres, mientras que el cambio de contraseña exige 8 con letras, números y un símbolo (C-02).

En el rediseño, la pantalla final ya no dice "ingrese con la contraseña que acaba de definir": indica que revise su correo y que el sistema le pedirá una contraseña nueva, que es lo que ocurre en los dos casos.

**Propuesta:** elegir un solo camino. O se quita el paso de contraseña y se usa siempre la temporal por correo, o se guarda la contraseña elegida (con la política de 8 caracteres), sin forzar el cambio y sin enviarla por correo.

---

### C-24 · El código QR de 2FA que muestra la afiliación no sirve y expone el secreto
**Prioridad:** Alta · **Por corregir**

**Qué pasa:** al afiliarse, el backend genera un secreto TOTP, lo guarda con `mfa_enabled = FALSE` y lo devuelve en la respuesta y en el correo. La pantalla muestra el QR y la clave en texto. Pero cuando el asociado activa la verificación en dos pasos desde "Seguridad", `setup2fa` ([authController.js:739](backend/src/controllers/authController.js#L739)) genera **otro** secreto. El código que escaneó al afiliarse nunca funciona, y el secreto queda expuesto en una página pública, en el correo y en la base de datos sin uso.

En el rediseño se mantuvo el QR (no se cambian flujos de seguridad), pero ya no se le pide a la persona que lo escanee "para activar su acceso".

**Propuesta:** no generar el secreto en la afiliación. Que la verificación en dos pasos se active solo desde "Seguridad", como ya permite el sistema.

---

### C-25 · Una contraseña bancaria incorrecta en la afiliación manda a la pantalla de inicio de sesión
**Prioridad:** Alta · **Corregido** (`fix(afiliacion)`: `validarCredencialesBanco` responde 400 cuando el banco devuelve 401. Se mantienen el 403, usuario bloqueado, y los errores 5xx del banco)

**Qué pasa:** si las credenciales de la Banca en Línea son incorrectas, el backend responde **401** ([afiliacionOnlineController.js:139](backend/src/controllers/afiliacionOnlineController.js#L139)). El interceptor de [api.js](frontend/src/services/api.js) trata cualquier 401 como sesión vencida: borra el almacenamiento y redirige a `/login`. La persona, que todavía no tiene cuenta, termina en el inicio de sesión sin ver el mensaje de error y pierde lo que había escrito.

**Cómo verificar:** en `/registro-asociado`, ingresar un DPI de cliente del banco y una contraseña bancaria incorrecta.

**Propuesta:** que el backend responda 400 o 422 en ese caso, o que el interceptor no redirija en las rutas públicas (`/afiliacion/*`).

**Pendiente relacionado:** el banco responde con un mensaje distinto según qué dato falló ("el nombre de usuario no coincide", "el código es incorrecto", "la contraseña es incorrecta"). Eso permite adivinar los datos uno por uno. Conviene un solo mensaje genérico, como en C-14. También se podría reforzar el interceptor para que no redirija si no había sesión iniciada.

---

### C-26 · Crear un usuario o reiniciar su contraseña muestra dos avisos iguales
**Prioridad:** Baja · **Corregido** (`fix(usuarios)`: se quitaron las llamadas directas a `toast?.success`; queda un solo aviso)

**Qué pasa:** en [UsersPage.jsx](frontend/src/pages/UsersPage.jsx) los handlers llaman a `setSuccessMessage(...)`, que un efecto convierte en `toast.success`, y además llaman directamente a `toast?.success(...)` ([línea 466](frontend/src/pages/UsersPage.jsx#L466) y [línea 501](frontend/src/pages/UsersPage.jsx#L501)). Aparecen dos avisos con casi el mismo texto.

**Propuesta:** quitar la llamada directa a `toast?.success` y dejar solo `setSuccessMessage`.

---

### C-27 · Al editar un usuario, el administrador puede fijarle una contraseña que no expira
**Prioridad:** Media · **Corregido** (`fix(usuarios)`: se quitó el campo del modal y `updateUser` responde 400 `PASSWORD_CHANGE_NOT_ALLOWED` si recibe una contraseña; se cambia solo con «Reiniciar contraseña»)

**Qué pasa:** el modal "Editar usuario" tiene un campo "Contraseña nueva". `updateUser` ([userController.js:697](backend/src/controllers/userController.js#L697)) la guarda si tiene 6 caracteres con letras y números, sin símbolo, y **no** marca `debe_cambiar_password`. El administrador queda conociendo la contraseña de otra persona. Esto contradice la regla del resto del sistema: las contraseñas temporales las genera el servidor, nadie las ve y se cambian al primer ingreso. Además usa una política distinta de la de 8 caracteres con símbolo (C-02).

**Propuesta:** quitar ese campo y usar "Reiniciar contraseña", que ya hace lo correcto. Si se mantiene, aplicar la política de 8 caracteres y forzar el cambio al siguiente ingreso.

---

### C-28 · Desistir de un crédito lo guarda como "rechazado"
**Prioridad:** Media · **Por corregir**

**Qué pasa:** cuando el asociado desiste, `cancelarCredito` ([asociadoController.js:1095](backend/src/controllers/asociadoController.js#L1095)) pone `estado = 'RECHAZADA'` y agrega " [Cancelada voluntariamente por el asociado]" a las observaciones. Para el resto del sistema es un rechazo de la cooperativa: el asociado lo veía como "Denegada" y cuenta en las estadísticas de solicitudes rechazadas del ejecutivo y del administrador.

En el rediseño del simulador, el historial la muestra como "Cancelada por usted" (detectando esa marca) y oculta la marca de los comentarios. Es solo un arreglo visual; los datos siguen mezclados.

**Propuesta:** un estado propio, `CANCELADA`, con su valor en la base de datos, y excluirlo de las estadísticas de rechazos.

---

### C-29 · El servidor no valida el monto ni el plazo mínimo y máximo de un crédito
**Prioridad:** Baja · **Por corregir**

**Qué pasa:** `iniciarCredito` ([asociadoController.js:317](backend/src/controllers/asociadoController.js#L317)) solo exige que el monto y el plazo sean mayores que cero. Los límites (Q500 como mínimo, de 3 a 120 meses) solo existen en el formulario del simulador; una llamada directa a la API puede pedir Q1 a 1000 meses. La tasa del 10 % también está escrita dos veces, en el frontend y en el backend, en lugar de venir de un parámetro.

**Propuesta:** validar esos límites en el backend y enviar la tasa al frontend, por ejemplo junto con la capacidad crediticia.

---

### C-30 · La afiliación en línea revelaba el usuario del administrador
**Prioridad:** Media · **Corregido** (Fase 3.5)

**Qué pasaba:** `validarDpi` ([afiliacionOnlineController.js:36](backend/src/controllers/afiliacionOnlineController.js#L36)), que es una ruta **pública**, respondía al DPI del administrador con *"El usuario Administrador (steven08) es una cuenta de administración central…"*. Cualquiera que probara ese DPI obtenía el nombre de usuario de la cuenta con más privilegios.

**Qué se hizo:** ahora responde *"No es posible afiliar este DPI en línea. Comuníquese con la cooperativa."*, sin nombres. Conviene revisar si hay otros mensajes públicos que confirmen datos internos.

---

### C-31 · El aviso de intentos restantes permite saber si una cuenta existe
**Prioridad:** Media · **Por corregir**

**Qué pasa:** con un usuario que no existe, el login responde *"El usuario o la contraseña no son correctos."*. Con un usuario que sí existe y la contraseña mal, agrega *"Le quedan N intento(s)…"* ([authController.js:133](backend/src/controllers/authController.js#L133)). La diferencia permite probar códigos de usuario o correos hasta dar con uno real.

**Propuesta:** el mismo mensaje en los dos casos. Si se quiere avisar del bloqueo, hacerlo solo en el último intento o por correo al titular.

---

### C-32 · Un rol desconocido ve el panel del administrador
**Prioridad:** Baja · **Por corregir**

**Qué pasa:** [DashboardPage.jsx](frontend/src/pages/DashboardPage.jsx) muestra `AdminDashboard` cuando el rol no es ninguno de los cuatro conocidos. El backend rechaza sus peticiones, así que no hay fuga de datos, pero la persona ve la estructura del panel de administración vacía.

**Propuesta:** mostrar un mensaje ("Su usuario no tiene un rol asignado. Comuníquese con el administrador.") en lugar del panel.

---

## Corregidos durante el rediseño

Errores visuales o de contenido que se corrigieron dentro de los commits del rediseño, porque no tocaban lógica.

| Problema | Dónde | Fase |
|---|---|---|
| `text-red-650` no existía; el ícono de rechazo no tenía color | OperatorTrasladoModal | 1.1 |
| `shadow-xs`, `shadow-2xs` y `backdrop-blur-xs` son de Tailwind v4 y no hacían nada | 36 archivos | 1.3 |
| Contorno de los inputs con contraste 1.48:1 (WCAG pide 3:1) | `ui/Input` (token `line-input`) | 2 |
| El botón del ojo en el login no se alcanzaba con el teclado ni tenía nombre | LoginPage | 3.1 |
| La opción de correo del hotfix traía clases anteriores al rediseño | Navbar | 3.1 |
| El error de carga del panel de administración se guardaba pero nunca se mostraba | AdminDashboard | 3.3 |
| La etiqueta oculta "Acciones" de las tablas ensanchaba la página 16 px | `ui/Table` | 3.3 |
| Barra de desplazamiento vertical innecesaria en las pestañas | `ui/Tabs` | 3.3 |
| Degradados prohibidos en las tarjetas del asociado | Portal del asociado | 3.3 |
| El plan de pagos decía "10% anual" fijo aunque la tasa fuera otra | AssociateCreditsTab | 3.3 |
| El cambio obligatorio decía "Mínimo 6 caracteres", pero valida 8 | ForcedPasswordChangeModal | 3.4 |
| Degradado y parpadeo en la alerta de sesión concurrente | SecurityAlertModal | 3.4 |
| `ConfirmModal` mostraba siempre "Podrá iniciar una nueva simulación", también al cambiar el estado de un asociado. Ahora el aviso es la prop opcional `note` y solo lo pasa el simulador | ConfirmModal, CreditSimulatorPage | 3.4 |
| El botón de confirmar de `ConfirmModal` llevaba siempre un ícono ✕, incluso en acciones positivas | ConfirmModal | 3.4 |
| El modal de traslado mostraba el tipo de operación en código (`APERTURA_Y_TRASLADO`) | OperatorTrasladoModal | 3.4 |
| El botón "Subir PDF firmado" (evaluación del operador y resolución del ejecutivo) usaba un `<input type="file">` con `hidden`, que no se puede alcanzar con el teclado. Ahora es `sr-only` y muestra el anillo de foco | SignedPdfPanel | 3.4 |
| Degradados en el dictamen automático de la evaluación de crédito y encabezado oscuro del modal | OperatorCreditEvaluationModal | 3.4 |
| El modal de movimientos mostraba "undefined%" como tasa de interés, porque las cuentas del resumen no traen ese campo. Ahora solo se muestra si existe | AccountMovementsModal | 3.4 |
| El recorrido guiado prometía funciones que no existen (C-05). Se reescribieron sus pasos con lo que el portal hace hoy | AssociateOnboardingTour | 3.4 |
| Los botones "Descargar estado de cuenta" usaban degradado | AccountMovementsModal | 3.4 |
| La selección de la cuenta bancaria del colaborador (nuevo asociado) eran `<div>` con `onClick`: no se podía elegir con el teclado ni se anunciaba como opción. Ahora son radio buttons con el mismo aspecto | NewAssociateModal | 3.4 |
| La tabla de créditos del operador ponía "Devuelta:" ante cualquier comentario del ejecutivo, incluso en créditos aprobados. Ahora dice "Devuelta:" solo si el estado es `DEVUELTA_OPERADOR` y "Ejecutivo:" en los demás casos | CreditsPanel | 3.4 |
| La apertura de cuenta elegía el producto y el origen de fondos con `<div>` clicables. Ahora son radio buttons | OpenAccountModal | 3.4 |
| Al imprimir el expediente salía también la página de fondo. Ahora el modal usa `printable` y solo se imprime la ficha, con espacio para firmas | AssociateExpedienteModal, `ui/Modal`, index.css | 3.4 |
| El expediente y el selector de cuentas de beneficiarios nunca mostraban el tipo de cuenta: leían `tipo_cuenta`, pero el backend envía `tipo_cuenta_nombre` | AssociateExpedienteModal, BeneficiariesModal | 3.4 |
| El parentesco se mostraba en código ("CONYUGE", "PADRE/MADRE") | AssociateExpedienteModal, BeneficiariesModal | 3.4 |
| El modal de correo no distinguía "conectado", "sin verificar" y "sin configurar", y el envío de prueba simulado parecía real | GoogleEmailConfigModal | 3.4 |
| En la tabla de asociados, la columna fija de acciones tapaba el estado en pantallas de 1366 px | AssociatesManagementPage | 3.4 |
| La pantalla final de la afiliación en línea decía que se ingresa "con la contraseña que acabas de definir", pero el backend envía una temporal por correo y obliga a cambiarla (ver C-23) | DirectAffiliationSuccess | 3.4 |
| La afiliación en línea usaba tuteo, a diferencia del resto del sistema, y tenía un fondo de puntos decorativo | PublicAffiliationPage, `components/affiliation/*` | 3.4 |
| Las cuentas bancarias de la afiliación se mostraban con el tipo en código ("Cuenta AHORRO") y montos sin separador de miles | BankConfigStep | 3.4 |
| La constancia de agencia podía mostrar "Q0.00" como depósito estimado cuando la solicitud ya existía; ahora la fila solo aparece si hay monto | AgencyReceiptStep | 3.4 |
| Al imprimir, las firmas quedaban pegadas al contenido: la regla de impresión de index.css quita márgenes y rellenos a todos los `div`. Las firmas ahora usan `<footer>` | AgencyReceiptStep, AssociateExpedienteModal | 3.4 |
| Los filtros de rol y estado de Usuarios eran botones sin estado accesible; ahora usan `aria-pressed`. Los botones de ícono de la tabla solo tenían `title` y ahora también tienen nombre accesible | UsersPage | 3.4 |
| Los modales de Usuarios no cerraban con Escape ni devolvían el foco al cerrar. Ahora usan `ui/Modal` | UsersPage | 3.4 |
| El buscador de Usuarios decía "Buscar por usuario…" sin aclarar que solo busca por código de usuario | UsersPage | 3.4 |
| Los botones que querían ser rojos con `className="text-danger-700"` se veían grises: `cn` no resuelve conflictos y `text-ink-soft` de la variante ganaba por el orden del CSS. Afectaba a Quitar beneficiario, Rechazar traslado o afiliación, Desactivar 2FA, Suspender o desactivar y Desistir. `Button` tiene ahora las variantes `ghostDanger`, `secondaryDanger` y `ghostSuccess` | `ui/Button` y 9 archivos | 3.4 |
| El simulador usaba un degradado (`from-brand-50 to-teal-50`) y colores `rose-` fuera de la paleta | CreditSimulatorPage | 3.4 |
| La cuenta de acreditación del simulador se elegía con `<div>` clicables; los controles deslizantes de monto y plazo no tenían nombre accesible; el archivo firmado usaba `<input hidden>`, que no se alcanza con el teclado | CreditSimulatorPage | 3.4 |
| Una solicitud a la que el asociado había renunciado aparecía como "Denegada" (ver C-28) | CreditSimulatorPage | 3.4 |
| Los avisos flotantes decían "OPERACIÓN EXITOSA" en mayúsculas, mostraban siempre "4s" aunque la duración cambiara, anunciaban los mensajes de éxito como alertas urgentes (`role="alert"`) y usaban colores fuera de la paleta (`rose`, `blue`). Ahora tienen títulos simples ("Listo", "No se pudo completar"), `role="status"` salvo en errores, colores del sistema y respetan la preferencia de reducir movimiento | ToastContext, index.css | 3.5 |
| El aviso de acceso restringido mostraba los roles en código ("Se requieren permisos de ADMINISTRADOR") | RoleProtectedRoute, DashboardPage | 3.5 |
| El fondo base de la aplicación usaba `bg-slate-50` en vez de los tokens | index.css | 3.5 |
