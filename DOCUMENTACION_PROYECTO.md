# Sistema de Gestión Integral - Cooperativa (Portal y Backend)

Documento maestro de arquitectura, configuración técnica, catálogo de credenciales y manual de despliegue para la primera entrega del proyecto de graduación.

---

## 📑 Tabla de Contenidos
1. [Resumen del Proyecto y Alcance](#1-resumen-del-proyecto-y-alcance)
2. [Stack Tecnológico Utilizado](#2-stack-tecnológico-utilizado)
3. [Estructura del Repositorio](#3-estructura-del-repositorio)
4. [Base de Datos PostgreSQL](#4-base-de-datos-postgresql)
5. [Backend: API REST (Node.js & Express)](#5-backend-api-rest-nodejs--express)
6. [Frontend: Aplicación SPA (React & Vite)](#6-frontend-aplicación-spa-react--vite)
7. [Control de Acceso Basado en Roles (RBAC)](#7-control-de-acceso-basado-en-roles-rbac)
8. [Catálogo de Usuarios y Credenciales de Prueba](#8-catálogo-de-usuarios-y-credenciales-de-prueba)
9. [Guía de Instalación y Ejecución](#9-guía-de-instalación-y-ejecución)
10. [Suites de Pruebas Automatizadas](#10-suites-de-pruebas-automatizadas)

---

## 1. Resumen del Proyecto y Alcance

El sistema ha sido diseñado y construido siguiendo estrictamente las especificaciones definidas en `.agent/PROJECT_RULES.md`:

### Alcance Implementado:
1. **Módulo de Autenticación y Seguridad:** Inicio de sesión mediante JSON Web Tokens (JWT), verificación de contraseñas encriptadas (`bcryptjs`), expiración de sesiones y protección de endpoints privados.
2. **Módulo de Gestión de Usuarios (CRUD Completo):** Creación, consulta filtrada, actualización y **borrado lógico** de cuentas de usuario.
3. **Control de Accesos por Roles (RBAC):** Restricciones granulares en Backend y Frontend para los roles `ADMINISTRADOR`, `OPERADOR` y `ASOCIADO`.
4. **Protocolos de Seguridad Bancaria y Anti-Fuerza Bruta:** Control de intentos fallidos, aviso de intentos restantes, bloqueo temporal de 15 minutos tras 3 fallos consecutivos, trazabilidad en auditoría inmutable y opción de desbloqueo administrativo con 1 solo clic.
5. **Control de Sesión Única Concurrente y Alerta en Tiempo Real:** Restricción de acceso simultáneo por cuenta, rechazo en el dispositivo secundario y emisión inmediata de alerta de seguridad en el navegador con sesión activa mediante WebSockets.
6. **Monitoreo de Presencia en Tiempo Real:** Detección en vivo de usuarios en línea o desconectados mediante WebSockets o latidos de presencia periódicos (`ultimo_ping` < 2 min).

---

## 2. Stack Tecnológico Utilizado

### Backend
- **Entorno de Ejecución:** Node.js (v20+ / ESM & CJS compatible).
- **Framework Web:** Express.js (v4.21.2).
- **Comunicación en Tiempo Real:** Socket.io (v4.8.1) para WebSockets, alertas de seguridad instantáneas y monitor de presencia.
- **Servidor HTTP:** Módulo nativo `http` de Node.js coordinando Express y Socket.io.
- **Driver PostgreSQL:** `pg` (v8.13.3) con configuración de Pool de conexiones.
- **Seguridad y Criptografía:** 
  - `bcryptjs` (v2.4.3) con 10 rondas de salteo (*salt rounds*).
  - `jsonwebtoken` (v9.0.2) para generación y verificación de tokens JWT firmados.
  - `crypto` (módulo nativo de Node.js) para generación de identificadores únicos UUID de sesión activa.
- **Utilidades:** `dotenv` (gestión de variables de entorno), `cors` (habilitación de CORS para el frontend).
- **Desarrollo:** `nodemon` (recarga automática en caliente).

### Frontend
- **Librería UI:** React 18 (`react`, `react-dom`).
- **Empaquetador y Build Tool:** Vite (v6.0.7+) con `@vitejs/plugin-react`, soporte para exposición en red local (`host: true`) y proxy WebSocket (`ws: true`).
- **Cliente WebSocket:** `socket.io-client` (v4.8.1) con reconexión automática y latidos de presencia periódicos.
- **Enrutamiento:** `react-router-dom` (v6.28.1) con enrutamiento declarativo y protección por roles.
- **Cliente HTTP:** Axios (v1.7.9) con interceptores para inyección de token JWT, manejo global de 401 y redirección transparente.
- **Estilos y Diseño:** TailwindCSS (v3.4.17), PostCSS y Autoprefixer. Tipografía moderna *Inter* de Google Fonts y efectos de *Glassmorphism*.
- **Iconografía:** `lucide-react` (v0.475.0).
- **Gráficas y Analítica Visual:** `chart.js` (v4.5.1) y `react-chartjs-2` (v5.3.1) para visualización de KPIs, distribución por roles en dona y barras de altas semestrales.

### Base de Datos
- **Motor:** PostgreSQL (v14+ / Postgres local en puerto 5432).
- **Estrategia de Persistencia:** Tablas relacionales normalizadas (3FN) con restricciones `CHECK`, índices en columnas de búsqueda, migración automática de esquema y borrado lógico exclusivo mediante columna `estado`.

---

## 3. Estructura del Repositorio

```
cooperativa-app/
├── DOCUMENTACION_PROYECTO.md       # Documento maestro del proyecto (este archivo)
├── .agent/
│   └── PROJECT_RULES.md            # Reglas de negocio y alcance del proyecto
├── backend/                        # Servidor API REST en Node.js/Express + Socket.io
│   ├── .env                        # Variables de entorno locales (PORT=5001)
│   ├── .env.example                # Plantilla de configuración
│   ├── database.sql                # Script DDL de PostgreSQL, datos semilla y columnas de seguridad
│   ├── package.json                # Dependencias (Express, Socket.io, bcryptjs, jwt, pg)
│   ├── testAuth.js                 # Suite de pruebas automatizadas de Login
│   ├── testUsers.js                # Suite de pruebas automatizadas del CRUD
│   ├── testRBAC.js                 # Suite de pruebas automatizadas de RBAC
│   ├── testSecurityProtocols.js    # Suite de pruebas: Fuerza Bruta, Concurrencia y Presencia (27 tests)
│   ├── testProfileAndSecurity.js   # Suite de pruebas: Perfil y Cambio de Contraseña (12 tests)
│   ├── testAdminDashboardAudit.js  # Suite de pruebas: Auditoría y Dashboard Administrativo (13 tests)
│   └── src/
│       ├── server.js               # Servidor HTTP, Express, Socket.io y migración automática
│       ├── config/
│       │   ├── db.js               # Conexión y Pool de PostgreSQL (pg)
│       │   └── migrations.js       # Migraciones automáticas e idempotentes de esquema
│       ├── controllers/
│       │   ├── authController.js   # Login (fuerza bruta, concurrencia), Perfil y Logout
│       │   └── userController.js   # CRUD, Borrado Lógico, Presencia, Desbloqueo y Auditoría Reciente
│       ├── middlewares/
│       │   ├── authMiddleware.js   # Middlewares verifyToken y checkRole
│       │   └── authRoutes.js       # Rutas /api/auth (/login, /me, /perfil, /cambiar-password, /logout)
│       ├── routes/
│       │   ├── authRoutes.js       # Rutas /api/auth
│       │   └── userRoutes.js       # Rutas /api/usuarios (+ /auditoria/eventos-recientes, /:id/desbloquear)
│       └── services/
│           └── socketService.js    # Servicio centralizado de WebSockets, alertas y presencia
└── frontend/                       # Aplicación Web SPA en React + Vite + TailwindCSS
    ├── .env                        # Variables de entorno cliente (VITE_API_URL=/api)
    ├── .env.example                # Plantilla de configuración cliente
    ├── index.html                  # HTML principal con metadatos y fuentes
    ├── package.json                # Dependencias (React, Vite, Socket.io-client, Axios, Lucide, Chart.js)
    ├── postcss.config.js           # Configuración de PostCSS
    ├── tailwind.config.js          # Configuración de temas y colores corporativos
    ├── vite.config.js              # Configuración de Vite (puerto 3000, host: true, proxy API y WS)
    └── src/
        ├── App.jsx                 # Configuración de rutas y proveedores
        ├── index.css               # Estilos globales y utilidades Tailwind
        ├── main.jsx                # Punto de entrada de React
        ├── components/
        │   ├── common/
        │   │   └── SecurityAlertModal.jsx # Modal bancario de alerta en tiempo real
        │   ├── profile/
        │   │   ├── UpdateProfileModal.jsx # Modal para actualizar teléfono en personas
        │   │   └── ChangePasswordModal.jsx # Modal seguro de cambio de contraseña
        │   ├── layout/
        │   │   ├── Layout.jsx      # Contenedor principal con Navbar y Footer
        │   │   └── Navbar.jsx      # Barra superior institucional con User Dropdown Menu
        │   ├── ProtectedRoute.jsx  # Guarda de rutas autenticadas
        │   └── RoleProtectedRoute.jsx # Guarda de rutas exclusivas por rol
        ├── context/
        │   └── AuthContext.jsx     # Estado global de sesión, Socket.io, presencia e inactividad
        ├── pages/
        │   ├── AdminDashboard.jsx  # Centro de Monitoreo bancario, KPIs, Chart.js y Auditoría
        │   ├── AssociateDashboard.jsx # Vista financiera para el rol Asociado
        │   ├── CreditSimulatorPage.jsx # Simulador interactivo de créditos
        │   ├── DashboardPage.jsx   # Enrutador de dashboard personalizado por rol
        │   ├── LoginPage.jsx       # Pantalla de acceso corporativo
        │   ├── OperatorDashboard.jsx # Panel operativo para rol Operador
        │   └── UsersPage.jsx       # Tabla con presencia en vivo y desbloqueo en 1 clic
        └── services/
            ├── api.js              # Instancia centralizada de Axios
            └── socket.js           # Cliente singleton de Socket.io con latido continuo
```

---

## 4. Base de Datos PostgreSQL (Arquitectura 3FN)

### Conexión Local (macOS)
- **Host:** `localhost`
- **Puerto:** `5432`
- **Usuario:** `stevenortiz`
- **Contraseña:** *(vacía)*
- **Nombre de Base de Datos:** `cooperativa_db`

### Módulos y Tablas Normalizadas (3FN)

La base de datos se encuentra estructurada en 4 módulos relacionales altamente desacoplados con estandarización de identificadores (`id_entidad`) y relación 1:1 en `usuarios(id_persona)`:

1. **Módulo de Seguridad (RBAC Dinámico):**
   - `roles` (`id_rol`, `codigo`, `nombre`, `descripcion`, `estado`)
   - `permisos` (`id_permiso`, `codigo`, `modulo`, `descripcion`)
   - `roles_permisos` (`id_rol`, `id_permiso`) - Tabla pivote para relación N:M.
2. **Módulo de Identidades y Seguridad Bancaria:**
   - `personas` (`id_persona`, `cui_dpi`, `primer_nombre`, `segundo_nombre`, `primer_apellido`, `segundo_apellido`, `telefono`, `direccion`, `fecha_nacimiento`, `fecha_creacion`) - Datos personales y biométricos (Única fuente de verdad).
   - `usuarios` (`id_persona` PK/FK REFERENCES personas(id_persona), `id_rol` FK, `codigo_corporativo` UNIQUE NOT NULL [4 dígitos], `email` UNIQUE, `password_hash`, `estado`, `intentos_fallidos`, `bloqueado_hasta`, `sesion_activa_id`, `ultimo_ping`, `ultimo_acceso`, `fecha_creacion`) - Credenciales de acceso, control de fuerza bruta y presencia en tiempo real.
3. **Módulo de Auditoría (Trazabilidad):**
   - `historial_estados_usuario` (`id_historial_estado`, `id_usuario_modificado` FK, `estado_anterior`, `estado_nuevo`, `id_rol_anterior` FK, `id_rol_nuevo` FK, `id_modificado_por` FK, `motivo`, `fecha_cambio`) - Registro inmutable de auditoría para borrado lógico, bloqueos por fuerza bruta (`'BLOQUEADO_TEMPORAL'`) y desbloqueos administrativos.
4. **Módulo de Asociados y Finanzas:**
   - `asociados` (`id_asociado`, `id_persona` FK UNIQUE, `fecha_ingreso`, `estado_asociado`)
   - `tipos_cuenta` (`id_tipo_cuenta`, `nombre`, `tasa_interes_anual`, `monto_minimo_apertura`)
   - `cuentas` (`id_cuenta`, `numero_cuenta` UNIQUE, `id_asociado` FK, `id_tipo_cuenta` FK, `saldo_disponible`, `saldo_reserva`, `estado`, `fecha_apertura`)
   - `solicitudes_credito` (`id_solicitud_credito`, `id_asociado` FK, `monto_solicitado`, `plazo_meses`, `tasa_interes`, `cuota_mensual_estimada`, `estado`, `id_analista` FK, `observaciones`, `fecha_solicitud`)
   - `transacciones` (`id_transaccion`, `id_cuenta` FK, `tipo_transaccion`, `monto`, `saldo_anterior`, `saldo_nuevo`, `referencia`, `id_usuario_registra` FK, `fecha_transaccion`)

### Regla de Borrado Lógico vs Bloqueo por Fuerza Bruta
- **Borrado Lógico:** El sistema **nunca** ejecuta instrucciones `DELETE` en usuarios o asociados. La eliminación lógica se reserva exclusivamente para la columna `estado`:
  ```sql
  UPDATE usuarios SET estado = 'INACTIVO' WHERE id_persona = $1;
  ```
- **Bloqueo por Fuerza Bruta:** La columna `estado` se mantiene intacta en `'ACTIVO'` para no corromper el borrado lógico. El congelamiento temporal se gestiona con `bloqueado_hasta` e `intentos_fallidos`:
  ```sql
  UPDATE usuarios SET intentos_fallidos = 3, bloqueado_hasta = CURRENT_TIMESTAMP + INTERVAL '15 minutes' WHERE id_persona = $1;
  ```
- **Migraciones Automáticas:** El sistema cuenta con [migrations.js](file:///home/steven/Descargas/cooperativa-app/backend/src/config/migrations.js) que se ejecuta al inicio del servidor y aplica `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS...` sin requerir reinicializaciones destructivas de la base de datos.

---

## 5. Backend: API REST & WebSockets (Node.js & Express & Socket.io)

El servidor corre por defecto en el puerto `5001` (`http://localhost:5001` y expuesto en red local en `0.0.0.0:5001`).

### Endpoints Disponibles

| Método | Endpoint | Nivel de Acceso | Descripción | Códigos HTTP |
|:---|:---|:---|:---|:---|
| `GET` | `/api/health` | Público | Verificación de estado del servidor | `200` |
| `POST` | `/api/auth/login` | Público | Autenticación con email o código corporativo (4 dígitos). Aplica bloqueo por fuerza bruta (3 intentos) y control de sesión concurrente | `200`, `400`, `401`, `403`, `409`, `423`, `500` |
| `GET` | `/api/auth/me` | Autenticado (`Cualquier rol`) | Retorna información del usuario de la sesión actual | `200`, `401`, `404` |
| `POST` | `/api/auth/logout` | Autenticado (`Cualquier rol`) | **Cierre de sesión formal:** Limpia `sesion_activa_id`, `ultimo_ping` y desconecta sockets | `200`, `401`, `500` |
| `PATCH` | `/api/auth/perfil` | Autenticado (`Cualquier rol`) | Actualiza datos de contacto (teléfono) en la tabla `personas` | `200`, `400`, `401`, `404`, `500` |
| `POST` | `/api/auth/cambiar-password` | Autenticado (`Cualquier rol`) | Cambio seguro de contraseña con validación de clave actual y bcrypt | `200`, `400`, `401`, `404`, `500` |
| `GET` | `/api/usuarios` | `ADMINISTRADOR` | Lista usuarios con cálculo dinámico de `en_linea` y `bloqueado_por_intentos` (Filtros: `?estado=`, `?search=`) | `200`, `401`, `403` |
| `GET` | `/api/usuarios/auditoria/eventos-recientes` | `ADMINISTRADOR` | Obtiene los últimos 5 eventos de seguridad registrados en `historial_estados_usuario` | `200`, `401`, `403` |
| `GET` | `/api/usuarios/:id` | `ADMINISTRADOR` | Detalle de un usuario específico | `200`, `401`, `403`, `404` |
| `POST` | `/api/usuarios` | `ADMINISTRADOR` | Crea un usuario con contraseña encriptada en `bcrypt` | `201`, `400`, `401`, `403`, `409` |
| `PUT` | `/api/usuarios/:id` | `ADMINISTRADOR` | Actualiza datos de usuario (contraseña opcional) | `200`, `400`, `401`, `403`, `404`, `409` |
| `DELETE` | `/api/usuarios/:id` | `ADMINISTRADOR` | **Borrado Lógico:** Cambia estado a `'INACTIVO'` | `200`, `401`, `403`, `404` |
| `PATCH` | `/api/usuarios/:id/desbloquear` | `ADMINISTRADOR` | **Desbloqueo en 1 Clic:** Restaura intentos fallidos y remueve bloqueo temporal con auditoría | `200`, `401`, `403`, `404`, `500` |
| `GET` | `/api/asociado/perfil` | `ASOCIADO` | Retorna el perfil del asociado uniendo personas, asociados y usuarios | `200`, `401`, `403`, `404` |
| `GET` | `/api/asociado/cuentas` | `ASOCIADO` | Retorna las cuentas activas (Ahorro y Aportaciones) del asociado | `200`, `401`, `403` |
| `GET` | `/api/asociado/cuentas/:id_cuenta/transacciones` | `ASOCIADO` | Historial de transacciones de una cuenta de su propiedad | `200`, `401`, `403` |
| `GET` | `/api/asociado/creditos` | `ASOCIADO` | Listado de solicitudes de créditos del asociado | `200`, `401`, `403` |
| `POST` | `/api/asociado/creditos` | `ASOCIADO` | Crea una solicitud de crédito calculando la cuota con amortización francesa | `201`, `400`, `401`, `403`, `500` |

### Protocolos de Seguridad Bancaria y WebSockets (Socket.io)

1. **Protección Anti-Fuerza Bruta:**
   - Si las credenciales fallan, se incrementa `intentos_fallidos`.
   - Se informa al usuario cuántos intentos restan (ej. *"Credenciales inválidas. Te quedan 2 intento(s) antes del bloqueo"*).
   - Al tercer fallo, se establece `bloqueado_hasta = CURRENT_TIMESTAMP + INTERVAL '15 minutes'`, se registra la traza en `historial_estados_usuario` y se responde con código HTTP `423 Locked`.
   - Durante el periodo de bloqueo, cualquier intento posterior es rechazado inmediatamente.
   - El Administrador puede reactivar la cuenta con 1 clic mediante `PATCH /api/usuarios/:id/desbloquear`.

2. **Control de Sesión Única Concurrente:**
   - Si un usuario tiene un `sesion_activa_id` válido y una conexión activa por WebSocket, un nuevo inicio de sesión en otro navegador o dispositivo es rechazado con código HTTP `409 Conflict` (*"Acceso denegado: Este usuario ya cuenta con una sesión activa en otro dispositivo. Cierre la sesión previa para continuar"*).
   - En el navegador previamente conectado, el servidor emite el evento WebSocket `security_alert`, desplegando un aviso en tiempo real de intento de acceso no autorizado.

3. **Muerte de Sesión Bancaria al Retroceder a `/login`:**
   - Si un usuario autenticado pulsa el botón o tecla "Atrás" del navegador y aterriza en `/login`, la aplicación intercepta la navegación y ejecuta un cierre de sesión forzoso e inmediato (`POST /api/auth/logout`), limpiando tokens de almacenamiento (`coop_token`, `coop_user`, `coop_last_activity`), destruyendo el socket y anulando `sesion_activa_id` en la BD.
   - Se muestra un banner de seguridad: *"Sesión cerrada por seguridad bancaria al regresar a la pantalla de acceso"*.
   - Si el usuario intenta presionar el botón "Adelante" del navegador, las rutas privadas (`ProtectedRoute`) bloquean el acceso y lo devuelven a `/login`.

4. **Temporizador de Inactividad de 10 Minutos:**
   - El frontend (`AuthContext.jsx`) monitoriza continuamente la interacción física del usuario (movimientos de ratón, clics, pulsaciones de teclas, toques en pantalla y scroll) con sincronización entre pestañas (`storage event`).
   - Tras 10 minutos continuos (600,000 ms) sin actividad registrada en ninguna pestaña abierta, la sesión se cancela automáticamente en el servidor y el usuario es redirigido a `/login?motivo=inactividad` mostrando el aviso: *"Su sesión ha expirado automáticamente por inactividad (10 minutos) para proteger su cuenta"*.

5. **Presencia Fuera de Línea Instantánea:**
   - **En el Backend:** El logout formal y la desconexión del socket limpian tanto `sesion_activa_id = NULL` como `ultimo_ping = NULL`. Además, la condición para considerar a un usuario `en_linea` exige estrictamente la existencia de una sesión activa (`Boolean(u.sesion_activa_id)`). Esto elimina el retraso de 2 minutos que ocurría anteriormente al calcular el ping reciente.
   - **En el Frontend:** Al recibirse el evento `presence_update`, la tabla de usuarios en `UsersPage.jsx` actualiza directamente el estado en memoria, cambiando el indicador a gris ("Desconectado") o verde ("En línea") en milisegundos sin requerir peticiones de red ni recarga del navegador.

6. **Eventos de WebSockets Manejados:**
   - `authenticate`: Vincula el socket al usuario tras validar el token JWT.
   - `ping_presencia` / `pong_presencia`: Latido de presencia periódica para mantener actualizado `ultimo_ping` mientras la sesión esté activa.
   - `security_alert`: Alerta bancaria instantánea emitida al cliente activo si alguien intenta vulnerar sus credenciales.
   - `presence_update`: Difusión del estado en línea/desconectado para actualizar la UI en vivo en milisegundos.

---

## 6. Frontend: Aplicación SPA (React & Vite)

El cliente web corre por defecto en el puerto `3000` (`http://localhost:3000`).

### Componentes Clave
1. **`AuthContext.jsx`:** Maneja el estado global de autenticación (`user`, `token`, `isAuthenticated`, `isLoading`), sincronizado con `localStorage` (`coop_token`, `coop_user`), e inicializa el canal bidireccional de `Socket.io` escuchando eventos `'security_alert'` para desplegar notificaciones bancarias de emergencia.
2. **`SecurityAlertModal.jsx`:** Modal visual con diseño bancario y animación de advertencia que salta en tiempo real en la pantalla del usuario activo si alguien intenta acceder con sus credenciales desde otro equipo o navegador.
3. **`LoginPage.jsx`:**
   - Diseño corporativo formal de banca institucional (verde esmeralda y gris claro).
   - Formulario reactivo con control de visibilidad de contraseña.
   - Mensajes dinámicos de intentos fallidos restantes (*"Te quedan X intentos antes del bloqueo"*).
   - Detección visual de cuenta bloqueada y rechazo por sesión concurrente.
4. **`ProtectedRoute.jsx`:** Protege las rutas privadas; si no hay sesión activa, redirige automáticamente a `/login`.
5. **`RoleProtectedRoute.jsx`:** Restringe rutas a roles autorizados (ej. `/usuarios` exclusivo para `ADMINISTRADOR`, `/simulador-credito` exclusivo para `ASOCIADO`).
6. **`DashboardPage.jsx`:** Enrutador modular por roles que despacha:
   - `ADMINISTRADOR`: Renderiza el nuevo [AdminDashboard.jsx](file:///home/steven/Descargas/cooperativa-app/frontend/src/pages/AdminDashboard.jsx).
   - `OPERADOR`: Renderiza [OperatorDashboard.jsx](file:///home/steven/Descargas/cooperativa-app/frontend/src/pages/OperatorDashboard.jsx).
   - `ASOCIADO`: Renderiza [AssociateDashboard.jsx](file:///home/steven/Descargas/cooperativa-app/frontend/src/pages/AssociateDashboard.jsx).
7. **`AdminDashboard.jsx` (Centro de Monitoreo y Estadísticas Operativas):**
   - **4 KPIs Administrativos en tiempo real:** Total Usuarios (con desglose de asociados y operadores), Usuarios Activos (% operativo), Cuentas Bloqueadas / Inactivas (desglose por intentos vs borrado lógico) y Sesiones en Línea sincronizadas con WebSockets.
   - **Estadísticas Gráficas (`chart.js` & `react-chartjs-2`):**
     - Gráfica de Dona (Doughnut): Distribución proporcional de usuarios por rol (Asociados en verde, Operadores en azul, Administradores en púrpura) con tooltip interactivo y leyenda porcentual.
     - Gráfica de Barras: Actividad semestral de nuevos registros y altas de usuarios en PostgreSQL.
   - **Tabla de Últimos Eventos de Seguridad:** Consulta los últimos 5 eventos de `historial_estados_usuario` vía `GET /api/usuarios/auditoria/eventos-recientes` con badges de tipo de evento, usuario afectado, actor responsable, fecha/hora y motivo.
   - **Accesos Directos:** Navegación con 1 clic hacia Gestión de Usuarios, filtro de cuentas bloqueadas y sincronización de métricas.
8. **`AssociateDashboard.jsx`:**
   - Visualiza balances consolidados de ahorros y aportaciones.
   - Detalle de cuentas con modal para ver historial de movimientos/transacciones en tiempo real.
8. **`CreditSimulatorPage.jsx`:**
   - Simulador interactivo de monto y plazo para créditos con cálculo automático de cuota mensual amortizada francesa (10% anual).
   - Formulario de solicitud y tabla de seguimiento del estado del préstamo.
9. **`UsersPage.jsx`:** 
   - **Modal de Formulario 3FN:** Creación y edición completa de usuarios.
   - **Columna Estado:** Mantiene intacto el borrado lógico (`ACTIVO` / `INACTIVO`).
   - **Columna Presencia en Tiempo Real:** 
     - 🟢 **En línea:** Sesión abierta en este momento (WebSocket activo o ping < 2 min).
     - ⚪ **Desconectado:** Sin sesión activa reciente.
     - ⚠️ **Bloqueado por Intentos:** Alerta ámbar de congelamiento tras 3 intentos fallidos.
     - **Botón Desbloquear (1 clic):** Permite al Administrador reactivar la cuenta al instante mediante `PATCH /api/usuarios/:id/desbloquear`.
   - **Reactividad WebSocket:** Escucha `presence_update` para actualizar los estados en vivo sin requerir refrescar el navegador.
10. **`Navbar.jsx` (Header Institucional, User Dropdown Menu & Navegación Móvil):**
    - **Ancho Amplio Institucional:** Contenedor expandido a `max-w-[1680px]` con espaciado horizontal responsivo (`px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12`).
    - **Menú Móvil Desplegable (Hamburguesa ☰):** En pantallas reducidas (`< md`), incorpora un botón alternador para desplegar el menú de navegación institucional entre `/dashboard`, `/usuarios` o `/simulador-credito` con autocierre al cambiar de ruta o pulsar `Escape`.
    - Retira el botón estático e independiente de "Cerrar Sesión".
    - Transforma el avatar y bloque de usuario en un gatillo interactivo desplegable con indicador `ChevronDown`.
    - Menú flotante con fondo blanco, sombra suave y borde sutil que ofrece:
      - Encabezado con nombre, código corporativo / email y badge de rol.
      - **👤 Actualizar Datos:** Dispara el modal `UpdateProfileModal`.
      - **🔑 Cambiar Contraseña:** Dispara el modal `ChangePasswordModal`.
      - Separador horizontal sutil.
      - **🚪 Cerrar Sesión:** Opción destacada con `text-rose-600 hover:bg-rose-50` que ejecuta `logout()`.
    - **Accesibilidad y Usabilidad:** Detección de clic exterior (*click outside*) y tecla `Escape` para cierre automático instantáneo.
11. **`Layout.jsx` (Contenedor Maestro de Pantalla Ancha):**
    - Reemplazó el antiguo límite restrictivo de `max-w-7xl` (1280px) por una arquitectura fluida y amplia con `max-w-[1680px] w-full mx-auto` y padding adaptativo `p-4 sm:p-6 lg:p-8 xl:p-10 2xl:px-12`.
    - Permite que en monitores Full HD (1920×1080) y 2K la aplicación aproveche más del 92% del espacio horizontal, eliminando el amontonamiento de columnas en la tabla de usuarios de 9 campos y permitiendo que los gráficos del Centro de Monitoreo respiren con amplitud institucional.
12. **`UpdateProfileModal.jsx`:** Modal para actualizar datos de contacto institucionales del usuario autenticado (actualmente el campo Número de Teléfono persistido en la tabla `personas`).
13. **`ChangePasswordModal.jsx`:** Modal seguro para cambio de contraseña con validación de requisitos mínimos (mínimo 6 caracteres, confirmación y validación de contraseña actual contra `bcrypt`).

### Acceso en Red Local (LAN) y Configuración de Proxy
- **Exposición de Red:** En [vite.config.js](file:///home/steven/Descargas/cooperativa-app/frontend/vite.config.js), se configuró `host: true`, lo cual permite que cualquier dispositivo en la misma red Wi-Fi o Ethernet acceda mediante la IP de la máquina anfitriona (ej. `http://192.168.0.17:3000`).
- **Proxy Inverso de Desarrollo:** 
  - Las peticiones `/api` se redirigen internamente al backend en `http://localhost:5001`.
  - El cliente WebSockets (`socket.io-client`) se conecta de forma directa al puerto `5001` usando `http://${window.location.hostname}:5001`, lo cual garantiza máxima estabilidad, compatibilidad en red local y elimina ruidos de proxy en Vite.
  - Esto elimina problemas de CORS y evita la necesidad de configurar IPs dinámicas en los archivos `.env` de los clientes.

---

## 7. Control de Acceso Basado en Roles (RBAC)

| Módulo / Función | Rol `ADMINISTRADOR` | Rol `OPERADOR` | Rol `ASOCIADO` |
|:---|:---:|:---:|:---:|
| **Iniciar Sesión** | ✅ Permitido | ✅ Permitido | ✅ Permitido *(si está ACTIVO)* |
| **Consultar Perfil Propio (`/me`)** | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Navbar - Gestión de Usuarios** | ✅ Visible | ❌ Oculta | ❌ Oculta |
| **Navbar - Simulador de Créditos** | ❌ Oculto | ❌ Oculto | ✅ Visible |
| **Acceso a URL `/usuarios`** | ✅ Permitido | ⛔ Redirige (403) | ⛔ Redirige (403) |
| **Acceso a URL `/simulador-credito`**| ⛔ Redirige (403) | ⛔ Redirige (403) | ✅ Permitido |
| **Listar Usuarios en API** | ✅ Permitido | ⛔ Bloqueado (403) | ⛔ Bloqueado (403) |
| **Crear / Editar / Desactivar** | ✅ Permitido | ⛔ Bloqueado (403) | ⛔ Bloqueado (403) |
| **Desbloquear Cuenta Bloqueada** | ✅ Permitido | ⛔ Bloqueado (403) | ⛔ Bloqueado (403) |
| **Portal de Autogestión Asociado** | ❌ Excluido | ❌ Excluido | ✅ Permitido |

---

## 8. Catálogo de Usuarios y Credenciales de Prueba

Todos los usuarios tienen la misma contraseña maestra predeterminada: **`admin123`**, encriptada en PostgreSQL con `bcrypt` (10 salt rounds: `$2a$10$vNPUEupr.jaRBJ/2vUE4CurM.mZqeEc1PTGrA8Pds020v2tm0T1Ey`).

### 👑 Administradores (5 Usuarios)
| Cód. Corporativo | Nombre Completo | Correo Electrónico | Contraseña | DPI / CUI | Estado |
|:---:|:---|:---|:---:|:---:|:---:|
| **1001** | Steven Alejandro Ortiz Gómez | `admin@cooperativa.com` | `admin123` | `1000000000001` | `ACTIVO` |
| **1002** | Lucía Fernanda Morales Castillo | `admin.lucia@cooperativa.com` | `admin123` | `1000000000002` | `ACTIVO` |
| **1003** | Fernando José Herrera Ríos | `admin.fernando@cooperativa.com` | `admin123` | `1000000000003` | `ACTIVO` |
| **1004** | Valeria Sofía Méndez Alvarado | `admin.valeria@cooperativa.com` | `admin123` | `1000000000004` | `ACTIVO` |
| **1005** | Rodrigo Esteban Sandoval Paz | `admin.rodrigo@cooperativa.com` | `admin123` | `1000000000005` | `ACTIVO` |

### 💼 Operadores (5 Usuarios)
| Cód. Corporativo | Nombre Completo | Correo Electrónico | Contraseña | DPI / CUI | Estado |
|:---:|:---|:---|:---:|:---:|:---:|
| **2001** | Juan Carlos Martínez Pérez | `operador@cooperativa.com` | `admin123` | `2000000000001` | `ACTIVO` |
| **2002** | María Elena Gutiérrez Castro | `operador.maria@cooperativa.com` | `admin123` | `2000000000002` | `ACTIVO` |
| **2003** | Pedro Antonio Ramírez Solís | `operador.pedro@cooperativa.com` | `admin123` | `2000000000003` | `ACTIVO` |
| **2004** | Ana Patricia Vásquez Cruz | `operador.ana@cooperativa.com` | `admin123` | `2000000000004` | `ACTIVO` |
| **2005** | Diego Armando Flores Lima | `operador.diego@cooperativa.com` | `admin123` | `2000000000005` | `ACTIVO` |

### 👤 Asociados (6 Usuarios: 5 Activos + 1 Inactivo)
| Cód. Corporativo | Nombre Completo | Correo Electrónico | Contraseña | DPI / CUI | Estado |
|:---:|:---|:---|:---:|:---:|:---:|
| **3001** | Carlos Roberto López Gómez | `asociado.carlos@cooperativa.com` | `admin123` | `3000000000001` | `ACTIVO` |
| **3002** | Claudia Marcela Torres Reyes | `asociado.claudia@cooperativa.com` | `admin123` | `3000000000002` | `ACTIVO` |
| **3003** | Mario René Estrada Fuentes | `asociado.mario@cooperativa.com` | `admin123` | `3000000000003` | `ACTIVO` |
| **3004** | Karen Paola Aguilar Romero | `asociado.karen@cooperativa.com` | `admin123` | `3000000000004` | `ACTIVO` |
| **3005** | Jorge Luis Guzmán Cifuentes | `asociado.jorge@cooperativa.com` | `admin123` | `3000000000005` | `ACTIVO` |
| **3000** | Usuario Asociado Inactivo | `inactivo@cooperativa.com` | `admin123` | `3000000000000` | `INACTIVO` |

---

## 9. Guía de Instalación y Ejecución

### Prerrequisitos
- Node.js (versión 18 o superior).
- PostgreSQL en ejecución local (puerto 5432).

---

### Paso 1: Configurar la Base de Datos
1. Crear la base de datos en PostgreSQL si aún no existe:
   ```bash
   createdb cooperativa_db
   ```
2. Ejecutar el script SQL para crear las tablas y cargar los datos semilla iniciales:
   ```bash
   psql -h localhost -U stevenortiz -d cooperativa_db -f backend/database.sql
   ```
   *(Nota: Si la base de datos ya está creada, el servidor ejecutará automáticamente `migrations.js` al iniciar para asegurar las columnas requeridas sin tocar datos existentes).*

---

### Paso 2: Iniciar el Backend
1. Abrir una terminal y navegar al directorio `backend`:
   ```bash
   cd backend
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Iniciar el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```
   *El servidor quedará disponible en `http://localhost:5001` (y escuchando en `0.0.0.0:5001`)*.

---

### Paso 3: Iniciar el Frontend
1. Abrir una segunda terminal y navegar al directorio `frontend`:
   ```bash
   cd frontend
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Iniciar el cliente de desarrollo:
   ```bash
   npm run dev
   ```
   *La aplicación abrirá en `http://localhost:3000` y mostrará la URL de acceso en red local (ej. `http://192.168.0.17:3000`)*.

---

## 10. Suites de Pruebas Automatizadas

El proyecto incluye 6 suites de pruebas automatizadas independientes en la carpeta `backend/` para validar el funcionamiento integral del sistema:

### 1. Pruebas de Autenticación y JWT (`testAuth.js`)
Valida login exitoso por correo y código corporativo, login con contraseña errónea, login de usuario inactivo, validación de token JWT y rechazo de tokens adulterados:
```bash
cd backend
node testAuth.js
```

### 2. Pruebas del CRUD y Borrado Lógico (`testUsers.js`)
Valida listado, filtrado por estado, creación con hash bcrypt, actualización, borrado lógico en BD y persistencia:
```bash
cd backend
node testUsers.js
```

### 3. Pruebas de Control de Acceso por Roles (`testRBAC.js`)
Valida que usuarios con rol `OPERADOR` sean rechazados con código `403` en rutas administrativas, mientras que `ADMINISTRADOR` mantiene acceso completo:
```bash
cd backend
node testRBAC.js
```

### 4. Pruebas de Seguridad Bancaria y Sesión Concurrente (`testSecurityProtocols.js`)
Suite exhaustiva con **27 pruebas automatizadas** que validan:
- **Bloqueo por Fuerza Bruta:** Control de intentos 1 y 2, bloqueo temporal de 15 minutos en el intento 3 (status `423`), rechazo continuo durante el bloqueo y registro inmutable en `historial_estados_usuario`.
- **Desbloqueo en 1 Clic:** Invocación de `PATCH /api/usuarios/:id/desbloquear` por parte del Administrador, restauración de intentos a 0 y acceso inmediato.
- **Sesión Única Concurrente:** Conexión de cliente por WebSocket, intento de inicio de sesión concurrente desde otro navegador (status `409`), y recepción en tiempo real del evento `security_alert` en el dispositivo original.
- **Cierre de Sesión Formal y Presencia Inmediata:** Limpieza de `sesion_activa_id` y `ultimo_ping` a `NULL` tras `POST /api/auth/logout`, verificación instantánea de `en_linea: false` sin retraso de 2 minutos y autorización inmediata para nuevos dispositivos.
- **Presencia en Tiempo Real:** Detección de usuarios `en_linea` y `bloqueado_por_intentos` manteniendo intacta la columna `estado` como `ACTIVO`.

```bash
cd backend
node testSecurityProtocols.js
```

### 5. Pruebas de Perfil y Cambio de Contraseña (`testProfileAndSecurity.js`)
Suite con **12 pruebas automatizadas** que validan:
- **Actualizar Datos de Contacto:** Invocación de `PATCH /api/auth/perfil` con token activo, persistencia del nuevo teléfono en la tabla `personas` y retorno en la respuesta.
- **Cambio Seguro de Contraseña:** Validación de contraseña actual errónea (status `400`), longitud mínima menor a 6 caracteres, falta de coincidencia en confirmación, contraseña idéntica a la anterior y actualización exitosa con `bcrypt` permitiendo el inicio de sesión posterior con las nuevas credenciales.

```bash
cd backend
node testProfileAndSecurity.js
```

### 6. Pruebas de Auditoría y Dashboard Administrativo (`testAdminDashboardAudit.js`)
Suite con **13 pruebas automatizadas** que validan:
- **Protección RBAC:** Validación de código `403 Forbidden` al invocar `GET /api/usuarios/auditoria/eventos-recientes` con credenciales de `OPERADOR`, y código `401 Unauthorized` sin token.
- **Acceso Administrativo y Límite:** Acceso exitoso con rol `ADMINISTRADOR` respetando el límite por defecto (5 eventos) o configurable mediante parámetro query `?limit=N`.
- **Estructura de Datos Bancarios:** Verificación de campos obligatorios en cada evento (`id_historial`, `usuario_afectado`, `accion`, `estado_anterior`, `estado_nuevo`, `motivo`, `ip_origen`, `actor`, `fecha_evento`).
- **Trazabilidad en Vivo de Bloqueos:** Generación de un bloqueo deliberado por fuerza bruta y confirmación inmediata de que el nuevo registro aparece al tope de la lista de auditoría para su visualización en el dashboard administrativo.

```bash
cd backend
node testAdminDashboardAudit.js
```

---

## 10. Hardening y Remediación de Auditoría Bancaria (CWE-798, Helmet, JSDoc 3, Estándares de Producción)

Como resultado de la auditoría técnica de seguridad bancaria (`auditoria/REPORTE_AUDITORIA.md`), se implementó un paquete integral de robustecimiento arquitectónico en backend y frontend:

### 10.1 Eliminación de Fallback Strings Criptográficos (CWE-798) y Mecanismo Fail-Fast
- **Diagnóstico previo:** Presencia de valores por defecto hardcodeados (`|| 'super_secret_jwt_key...'` o usuario `'stevenortiz'`) que exponían el entorno a claves predecibles si faltaba el archivo `.env`.
- **Remediación:**
  - Se removieron todos los fallbacks inseguros en `server.js`, `socketService.js`, `authMiddleware.js`, `authController.js` y `db.js`.
  - Se incorporó una validación **Fail-Fast** en el ciclo inicial de arranque de `server.js`: si `JWT_SECRET`, `DB_USER` o `DB_NAME` no están presentes en el entorno, el servidor aborta su inicialización inmediatamente con código de salida `1` y un mensaje de seguridad formal.
  - Se configuró `dotenv` para resolver la ruta absoluta hacia `backend/.env` con independencia del directorio de trabajo (`cwd`).

### 10.2 Blindaje de Cabeceras HTTP con Helmet y Restricción CORS
- **Protección HTTP:** Se integró la biblioteca `helmet` en el pipeline Express para mitigar ataques XSS, Clickjacking, MIME-sniffing e inyección de cabeceras maliciosas.
- **Control CORS Institucional:** Restricción de orígenes permitidos mediante lista blanca (`FRONTEND_URL`, `http://localhost:3000`, `http://localhost:3001`, y redes locales institucionales `192.168.x.x`), control estricto de métodos HTTP (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) y cabeceras autorizadas (`Content-Type`, `Authorization`).

### 10.3 Sobriedad Institucional en Logs y Prohibición de Emojis
- Se eliminaron el 100% de emojis en el código productivo de backend y frontend, así como en los scripts de pruebas automatizadas.
- Se adoptó el estándar bancario de prefijos textuales entre corchetes: `[INFO]`, `[WARN]`, `[ERROR]`, `[SECURITY WARN]`, `[WS]`, `[DB]`, `[MIGRATION]`, `[SUITE]`, `[PASS]`, `[FAIL]`, `[SUMMARY]`, `[CLEANUP]`, `[SUCCESS]`.
- Se preserva el uso exclusivo de iconografía vectorial SVG (vía `lucide-react`) en los componentes visuales de la interfaz de usuario.

### 10.4 Parametrización Dinámica de Socket.io en Frontend
- El cliente de WebSocket en `frontend/src/services/socket.js` fue parametrizado utilizando la variable de entorno `import.meta.env.VITE_SOCKET_URL`.
- Se implementó un fallback resiliente hacia `window.location.origin` para entornos donde frontend y backend se sirven bajo el mismo dominio/proxy inverso.
- Se documentó la variable `VITE_SOCKET_URL` en `frontend/.env.example`.

### 10.5 Requisitos de Complejidad en Contraseñas
- En adición a la longitud mínima de 6 caracteres, se implementaron validaciones de complejidad obligatorias tanto en backend (`authController.changePassword`) como en frontend (`ChangePasswordModal.jsx`):
  - Validación con expresiones regulares para exigir al menos una letra (`/[a-zA-Z]/`) y al menos un número (`/[0-9]/`).
  - Mensajes de error claros e instructivos para el usuario final.

### 10.6 Eliminación de Números Mágicos en Consultas SQL
- Se reemplazaron identificadores fijos (como `tc.id_tipo_cuenta = 4`) por constantes legibles y mantenibles (`CONSTANTS.TIPO_CUENTA_PLANILLA = 'Cuenta de Planilla'`) en `asociadoController.js`, resolviendo el tipo de cuenta dinámicamente mediante subconsultas por nombre de catálogo.

### 10.7 Documentación Estándar JSDoc 3
- Se incorporaron bloques JSDoc 3 exhaustivos en todos los controladores críticos (`authController`, `userController`, `asociadoController`), middlewares (`authMiddleware`), configuración (`db`, `migrations`, `socketService`) y componentes modales de interfaz (`ChangePasswordModal`, `UpdateProfileModal`, `SecurityAlertModal`).
- Cada bloque documenta el propósito bancario, parámetros esperados `@param`, valores de retorno `@returns`, y posibles excepciones `@throws`.

---

## 11. Remediación Integral de Base de Datos y Arquitectura Relacional (PostgreSQL 14+)

En seguimiento a los hallazgos técnicos del [`auditoria/REPORTE_AUDITORIA_BASE_DATOS.md`](file:///home/steven/Descargas/cooperativa-app/auditoria/REPORTE_AUDITORIA_BASE_DATOS.md), se aplicaron optimizaciones estructurales en el DDL principal (`database.sql`), migraciones automáticas idempotentes (`migrations.js`) y controladores del backend:

### 11.1 Eliminación de Índices Redundantes (Cero Duplicidad de I/O)
- **Diagnóstico:** 5 índices manuales (`idx_usuarios_codigo_corporativo`, `idx_usuarios_email`, `idx_personas_cui`, `idx_asociados_persona`, `idx_cuentas_numero`) duplicaban los árboles B-Tree creados automáticamente por PostgreSQL para constraints `PRIMARY KEY` y `UNIQUE`.
- **Remediación:** Se eliminaron los 5 índices redundantes tanto en `migrations.js` como en `database.sql`, reduciendo el uso de memoria en `shared_buffers` y eliminando la sobrecarga de doble escritura en cada `INSERT` y `UPDATE`.

### 11.2 Cobertura de Foreign Keys con Índices B-Tree
- **Diagnóstico:** En PostgreSQL, las claves foráneas no generan índices automáticamente, obligando a bloqueos y lecturas secuenciales completas (*Sequential Scans*) en operaciones referenciales y `JOINs`.
- **Remediación:** Se crearon 10 índices de cobertura:
  - `idx_historial_modificado_por` sobre `historial_estados_usuario(id_modificado_por)`
  - `idx_cuentas_tipo_cuenta` sobre `cuentas(id_tipo_cuenta)`
  - `idx_solicitudes_credito_asociado` sobre `solicitudes_credito(id_asociado)`
  - `idx_solicitudes_credito_analista` sobre `solicitudes_credito(id_analista) WHERE id_analista IS NOT NULL`
  - `idx_solicitudes_traslado_asociado` sobre `solicitudes_traslado_apertura(id_asociado)`
  - `idx_solicitudes_traslado_origen` sobre `solicitudes_traslado_apertura(id_cuenta_origen)`
  - `idx_solicitudes_traslado_destino` sobre `solicitudes_traslado_apertura(id_cuenta_destino) WHERE id_cuenta_destino IS NOT NULL`
  - `idx_solicitudes_traslado_tipo_destino` sobre `solicitudes_traslado_apertura(id_tipo_cuenta_destino)`
  - `idx_solicitudes_traslado_operador` sobre `solicitudes_traslado_apertura(id_operador_resuelve) WHERE id_operador_resuelve IS NOT NULL`
  - `idx_transacciones_usuario_registra` sobre `transacciones(id_usuario_registra) WHERE id_usuario_registra IS NOT NULL`

### 11.3 Índices Compuestos y Parciales de Alto Rendimiento
- **Cartola de Movimientos:** Se reemplazó el índice simple `idx_transacciones_cuenta` por el índice compuesto `idx_transacciones_cuenta_fecha ON transacciones(id_cuenta, fecha_transaccion DESC)`, eliminando ordenamientos en memoria (*Sort Quicksort*) en consultas de historial de cuenta.
- **Bandeja del Operador:** Se creó el índice parcial ultraligero `idx_solicitudes_traslado_pendientes ON solicitudes_traslado_apertura(fecha_solicitud ASC) WHERE estado = 'PENDIENTE'`, optimizando el filtrado a $O(\log k)$ sobre casos activos.
- **Historial de Solicitudes del Asociado:** Se agregaron `idx_solicitudes_traslado_asociado_fecha` y `idx_solicitudes_credito_asociado_fecha`.

### 11.4 Mitigación de Condición de Carrera en Generación de Número de Caso
- **Diagnóstico:** El cálculo manual `SELECT MAX(id_solicitud) + 1` en JavaScript dentro de `asociadoController.js` exponía al sistema a violaciones de clave única (`duplicate key violates constraint`) bajo concurrencia milimétrica.
- **Remediación:**
  - Se creó la secuencia atómica `seq_numero_caso_traslado` calibrada al valor máximo existente.
  - Se implementó el trigger `trg_set_numero_caso` que ejecuta `trg_generar_numero_caso()` antes de la inserción (`BEFORE INSERT`), garantizando correlativos únicos atómicos (`CASO-YYYY-XXXX`) a nivel de motor PostgreSQL sin contención de bloqueos.
  - Se adaptó `asociadoController.createSolicitudTraslado` para delegar la generación del caso al motor.

### 11.5 Endurecimiento de Restricciones CHECK y Homogeneización
- `chk_traslado_cuentas_diferentes`: Impide que un usuario traslade fondos hacia la misma cuenta de origen (`CHECK (id_cuenta_destino IS NULL OR id_cuenta_origen <> id_cuenta_destino)`).
- `chk_credito_tasa_valida`: Valida que la tasa de interés sea no negativa y la cuota estimada positiva (`CHECK (tasa_interes >= 0 AND cuota_mensual_estimada > 0)`).
- Se homogeneizó la escala de montos de traslado a `NUMERIC(14, 2)`.

### 11.6 Inmutabilidad de Auditoría Bancaria
- Se modificó la clave foránea `historial_estados_usuario_id_usuario_modificado_fkey` para sustituir `ON DELETE CASCADE` por `ON DELETE RESTRICT ON UPDATE CASCADE`, asegurando que la pista de auditoría nunca se destruya físicamente.

### 11.7 Sincronización del Ciclo de Vida de Asociados
- En `userController.deleteUser`, dentro de la misma transacción atómica de borrado lógico, se sincroniza el estado del padrón cooperativo:
  ```javascript
  await client.query("UPDATE asociados SET estado_asociado = 'INACTIVO' WHERE id_persona = $1", [targetUserPersonaId]);
  ```

### 11.8 Columna Generada Almacenada Inmutable
- Se agregó en la tabla `personas` la columna `nombre_completo VARCHAR(255) GENERATED ALWAYS AS (...) STORED` utilizando concatenación de cadenas inmutable (`||`), garantizando un punto de lectura canónico sin duplicar lógica de concatenación en los controladores.

---

## 12. Despliegue con Docker y Orquestación con Docker Compose

El sistema cuenta con una arquitectura de contenedores completa para despliegue en entornos de desarrollo y producción utilizando Docker y Docker Compose:

### 12.1 Arquitectura de Contenedores

```
+-------------------------------------------------------------------------------+
|                       DOCKER COMPOSE (cooperativa-net)                        |
|                                                                               |
|  [frontend]                     [backend]                     [db]            |
|  Nginx 1.27 Alpine              Node.js 20 Alpine             PostgreSQL 16   |
|  Puerto Host: 3000              Puerto Host: 5000             Puerto Host:    |
|  (SPA React Vite)               (API REST + WebSockets)       5432            |
|        │                              │                        (Volumen:      |
|        └──────── Proxy HTTP /ws ──────┴────── Pool TCP ────────┘cooperativa_  |
|                                                                 db_data)      |
+-------------------------------------------------------------------------------+
```

### 12.2 Manifiestos y Configuración

| Archivo | Propósito | Características Clave |
| :--- | :--- | :--- |
| `docker-compose.yml` | Orquestación multi-servicio | Define `db`, `backend` y `frontend` en la red bridge `cooperativa-net` con healthchecks y volumen persistente. |
| `backend/Dockerfile` | Imagen de producción API | Base `node:20-alpine`, instalación de dependencias de producción, usuario no root `node`, `dumb-init` como PID 1 y healthcheck en `/api/health`. |
| `frontend/Dockerfile` | Imagen multi-stage SPA | **Etapa 1:** Compilación con Vite en `node:20-alpine`.<br>**Etapa 2:** Servidor de producción en `nginx:1.27-alpine` con configuración optimizada. |
| `frontend/nginx.conf` | Servidor web Nginx | Proxy inverso para `/api/` y WebSockets `/socket.io/`, compresión Gzip, cabeceras de seguridad bancaria y fallback para SPA. |
| `docker.env.example` | Plantilla de variables | Parámetros de entorno configurables para base de datos, puertos y tokens JWT. |

### 12.3 Comandos de Despliegue

1. **Configuración de Variables:**
   ```bash
   cp docker.env.example .env
   ```

2. **Compilar y Levantar Contenedores:**
   ```bash
   docker compose up --build -d
   ```

3. **Verificar Estado de Salud:**
   ```bash
   docker compose ps
   ```

4. **Monitorear Logs en Tiempo Real:**
   ```bash
   docker compose logs -f
   ```

5. **Detener Contenedores:**
   ```bash
   docker compose down
   ```

---

> **Proyecto:** Cooperativa - Sistema de Gestión Integral  
> **Ciclo:** Ciclo 10 - Proyecto de Graduación 2 (UMG)  
> **Año:** 2026
