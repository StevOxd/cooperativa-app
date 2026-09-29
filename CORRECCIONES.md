# Correcciones al sistema

Registro de errores y mejoras encontrados durante el rediseño del frontend (rama `feat/rediseno-ui`). Estos puntos **no forman parte del rediseño**, porque tocan lógica, validaciones, backend o infraestructura. Cada uno se corrige en su propio commit (`fix(...)`), para que el rediseño siga siendo solo visual.

**Cómo usar este archivo**
- Al corregir un punto, cambie su estado a **Corregido** y anote el commit.
- Si aparece un error nuevo, agréguelo con el siguiente número (`C-15`, `C-16`…).
- Prioridad: **Alta** = afecta seguridad o bloquea al usuario · **Media** = el usuario lo nota o confunde · **Baja** = limpieza o rendimiento.

## Resumen

| ID | Problema | Área | Prioridad | Estado |
|---|---|---|---|---|
| C-01 | La app se muestra detrás del cambio obligatorio de contraseña | Frontend · sesión | Alta | Pendiente |
| C-02 | "Mi cuenta" pide 6 caracteres, pero el backend exige 8 y un símbolo | Frontend · validación | Alta | Pendiente |
| C-03 | El recorrido guiado hay que cerrarlo dos veces | Frontend · asociado | Media | Pendiente |
| C-04 | Docker Compose no lee `docker.env` con el comando del README | Infraestructura | Media | Pendiente |
| C-05 | El recorrido guiado promete funciones que no existen | Contenido | Media | Pendiente |
| C-06 | Mensajes del backend y de los handlers con jerga técnica | Contenido | Media | Pendiente (Fase 3.5) |
| C-07 | Sin proxy de WebSocket en el servidor de desarrollo | Frontend · desarrollo | Baja | Por verificar |
| C-08 | Contraseña `'admin123'` como valor por defecto que no se usa | Frontend y backend | Baja | Pendiente |
| C-09 | Modales montados que nada abre | Frontend | Baja | Pendiente |
| C-10 | Clases de animación que no existen | Frontend | Baja | Pendiente (se van con la Fase 3.4) |
| C-11 | El paquete de JavaScript supera los 500 kB | Frontend · rendimiento | Baja | Pendiente |
| C-12 | Los KPI del administrador no cuentan a los ejecutivos | Frontend · admin | Baja | Pendiente |
| C-13 | Variables sin uso tras separar los dashboards | Frontend | Baja | Pendiente |
| C-14 | Mismo texto de error de credenciales en el backend para todos los casos | Backend · contenido | Baja | Pendiente (Fase 3.5) |
| C-15 | Si el correo falla, la afiliación se completa igual y el asociado no recibe su contraseña | Backend · correo | Alta | Pendiente |
| C-16 | Contraseñas temporales y secretos 2FA en los registros y en memoria | Backend · seguridad | Alta | Pendiente |

---

## Pendientes

### C-01 · La app se muestra detrás del cambio obligatorio de contraseña
**Prioridad:** Alta

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
**Prioridad:** Alta

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
**Prioridad:** Media

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
**Prioridad:** Media · **Fase 3.5**

**Qué pasa:** algunos mensajes que ve el usuario no los controla el diseño:
- Backend: *"[SECURITY ERROR] La sesión bancaria ha expirado…"*, *"Por motivos de seguridad institucional…"*.
- Handlers del frontend: *"Sesión cerrada por seguridad bancaria al regresar a la pantalla de acceso"* ([LoginPage](frontend/src/pages/LoginPage.jsx)).
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
**Prioridad:** Baja · **Se resuelve con la Fase 3.4**

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
**Prioridad:** Baja · **Fase 3.5**

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
| La tabla de créditos del operador ponía "Devuelta:" ante cualquier comentario del ejecutivo, incluso en créditos aprobados. Ahora dice "Devuelta:" solo si el estado es `DEVUELTA_OPERADOR` y "Ejecutivo:" en los demás casos | CreditsPanel | 3.4 |
