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

### Alcance Implementado (Primera Entrega):
1. **Módulo de Autenticación y Seguridad:** Inicio de sesión mediante JSON Web Tokens (JWT), verificación de contraseñas encriptadas (`bcryptjs`), expiración de sesiones y protección de endpoints privados.
2. **Módulo de Gestión de Usuarios (CRUD Completo):** Creación, consulta filtrada, actualización y **borrado lógico** de cuentas de usuario.
3. **Control de Accesos por Roles (RBAC):** Restricciones granulares en Backend y Frontend para los roles `ADMINISTRADOR`, `OPERADOR` y `ASOCIADO`.

---

## 2. Stack Tecnológico Utilizado

### Backend
- **Entorno de Ejecución:** Node.js (v20+ / ESM & CJS compatible).
- **Framework Web:** Express.js (v4.21.2).
- **Driver PostgreSQL:** `pg` (v8.13.3) con configuración de Pool de conexiones.
- **Seguridad y Criptografía:** 
  - `bcryptjs` (v2.4.3) con 10 rondas de salteo (*salt rounds*).
  - `jsonwebtoken` (v9.0.2) para generación y verificación de tokens JWT firmados.
- **Utilidades:** `dotenv` (gestión de variables de entorno), `cors` (habilitación de CORS para el frontend).
- **Desarrollo:** `nodemon` (recarga automática en caliente).

### Frontend
- **Librería UI:** React 18 (`react`, `react-dom`).
- **Empaquetador y Build Tool:** Vite (v6.0.7) con `@vitejs/plugin-react`.
- **Enrutamiento:** `react-router-dom` (v6.28.1) con enrutamiento declarativo y protección por roles.
- **Cliente HTTP:** Axios (v1.7.9) con interceptores para inyección de token JWT y manejo global de 401.
- **Estilos y Diseño:** TailwindCSS (v3.4.17), PostCSS y Autoprefixer. Tipografía moderna *Inter* de Google Fonts y efectos de *Glassmorphism*.
- **Iconografía:** `lucide-react` (v0.475.0).

### Base de Datos
- **Motor:** PostgreSQL (v14+ / Postgres.app local en macOS).
- **Estrategia de Persistencia:** Tablas relacionales con restricciones `CHECK`, índices en columnas de búsqueda y borrado lógico mediante columna `estado`.

---

## 3. Estructura del Repositorio

```
cooperativa-app/
├── DOCUMENTACION_PROYECTO.md       # Documento maestro del proyecto (este archivo)
├── .agent/
│   └── PROJECT_RULES.md            # Reglas de negocio y alcance del proyecto
├── backend/                        # Servidor API REST en Node.js/Express
│   ├── .env                        # Variables de entorno locales
│   ├── .env.example                # Plantilla de configuración
│   ├── database.sql                # Script DDL de PostgreSQL y datos de prueba
│   ├── package.json                # Dependencias y scripts del Backend
│   ├── testAuth.js                 # Suite de pruebas automatizadas de Login
│   ├── testUsers.js                # Suite de pruebas automatizadas del CRUD
│   ├── testRBAC.js                 # Suite de pruebas automatizadas de RBAC
│   └── src/
│       ├── server.js               # Servidor principal y middlewares globales
│       ├── config/
│       │   └── db.js               # Conexión y Pool de PostgreSQL (pg)
│       ├── controllers/
│       │   ├── authController.js   # Lógica de Login y Consulta de Perfil
│       │   └── userController.js   # Lógica de CRUD y Borrado Lógico
│       ├── middlewares/
│       │   └── authMiddleware.js   # Middlewares verifyToken y checkRole
│       └── routes/
│           ├── authRoutes.js       # Rutas /api/auth
│           └── userRoutes.js       # Rutas /api/usuarios
└── frontend/                       # Aplicación Web SPA en React + Vite
    ├── .env                        # Variables de entorno del cliente
    ├── .env.example                # Plantilla de configuración cliente
    ├── index.html                  # HTML principal con metadatos y fuentes
    ├── package.json                # Dependencias y scripts del Frontend
    ├── postcss.config.js           # Configuración de PostCSS
    ├── tailwind.config.js          # Configuración de temas y colores corporativos
    ├── vite.config.js              # Configuración de Vite (puerto 3000)
    └── src/
        ├── App.jsx                 # Configuración de rutas y proveedores
        ├── index.css               # Estilos globales y utilidades Tailwind
        ├── main.jsx                # Punto de entrada de React
        ├── components/
        │   ├── Layout.jsx          # Contenedor principal con Navbar y Footer
        │   ├── Navbar.jsx          # Barra superior adaptativa por rol
        │   ├── ProtectedRoute.jsx  # Guarda de rutas autenticadas
        │   └── RoleProtectedRoute.jsx # Guarda de rutas exclusivas por rol
        ├── context/
        │   └── AuthContext.jsx     # Estado global de sesión y localStorage
        ├── pages/
        │   ├── DashboardPage.jsx   # Dashboard personalizado por rol
        │   ├── LoginPage.jsx       # Pantalla de acceso con credenciales rápidas
        │   └── UsersPage.jsx       # Tabla interactiva y modal de gestión
        └── services/
            └── api.js              # Instancia centralizada de Axios
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
2. **Módulo de Identidades:**
   - `personas` (`id_persona`, `cui_dpi`, `primer_nombre`, `segundo_nombre`, `primer_apellido`, `segundo_apellido`, `telefono`, `direccion`, `fecha_nacimiento`, `fecha_creacion`) - Datos personales y biométricos (Única fuente de verdad).
   - `usuarios` (`id_persona` PK/FK REFERENCES personas(id_persona), `id_rol` FK, `codigo_corporativo` UNIQUE NOT NULL [4 dígitos], `email` UNIQUE, `password_hash`, `estado`, `ultimo_acceso`, `fecha_creacion`) - Credenciales de acceso al sistema con Código Corporativo como identificador de negocio.
3. **Módulo de Auditoría (Trazabilidad):**
   - `historial_estados_usuario` (`id_historial_estado`, `id_usuario_modificado` FK, `estado_anterior`, `estado_nuevo`, `id_rol_anterior` FK, `id_rol_nuevo` FK, `id_modificado_por` FK, `motivo`, `fecha_cambio`) - Registro inmutable de auditoría.
4. **Módulo de Asociados y Finanzas:**
   - `asociados` (`id_asociado`, `id_persona` FK UNIQUE, `fecha_ingreso`, `estado_asociado`)
   - `tipos_cuenta` (`id_tipo_cuenta`, `nombre`, `tasa_interes_anual`, `monto_minimo_apertura`)
   - `cuentas` (`id_cuenta`, `numero_cuenta` UNIQUE, `id_asociado` FK, `id_tipo_cuenta` FK, `saldo_disponible`, `saldo_reserva`, `estado`, `fecha_apertura`)
   - `solicitudes_credito` (`id_solicitud_credito`, `id_asociado` FK, `monto_solicitado`, `plazo_meses`, `tasa_interes`, `cuota_mensual_estimada`, `estado`, `id_analista` FK, `observaciones`, `fecha_solicitud`)
   - `transacciones` (`id_transaccion`, `id_cuenta` FK, `tipo_transaccion`, `monto`, `saldo_anterior`, `saldo_nuevo`, `referencia`, `id_usuario_registra` FK, `fecha_transaccion`)

### Regla de Borrado Lógico
El sistema **nunca** ejecuta instrucciones `DELETE` en las cuentas de usuario ni asociados. Toda acción de eliminación actualiza el registro con:
```sql
UPDATE usuarios SET estado = 'INACTIVO' WHERE id_persona = $1;
```
Y registra automáticamente la traza en `historial_estados_usuario`.


---

## 5. Backend: API REST (Node.js & Express)

El servidor corre por defecto en el puerto `5000` (`http://localhost:5000`).

### Endpoints Disponibles

| Método | Endpoint | Nivel de Acceso | Descripción | Códigos HTTP |
|:---|:---|:---|:---|:---|
| `GET` | `/api/health` | Público | Verificación de estado del servidor | `200` |
| `POST` | `/api/auth/login` | Público | Autenticación flexible con email o código corporativo (4 dígitos) y contraseña. Retorna JWT | `200`, `400`, `401`, `403`, `500` |
| `GET` | `/api/auth/me` | Autenticado (`Cualquier rol`) | Retorna información del usuario de la sesión actual (incluye código corporativo y DPI) | `200`, `401`, `404` |
| `GET` | `/api/usuarios` | `ADMINISTRADOR` | Lista usuarios (Filtros: `?estado=ACTIVO\|INACTIVO`, `?search=` por código corporativo, DPI, nombre, email) | `200`, `401`, `403` |
| `GET` | `/api/usuarios/:id` | `ADMINISTRADOR` | Detalle de un usuario específico | `200`, `401`, `403`, `404` |

| `POST` | `/api/usuarios` | `ADMINISTRADOR` | Crea un usuario con contraseña encriptada en `bcrypt` | `201`, `400`, `401`, `403`, `409` |
| `PUT` | `/api/usuarios/:id` | `ADMINISTRADOR` | Actualiza datos de usuario (contraseña opcional) | `200`, `400`, `401`, `403`, `404`, `409` |
| `DELETE` | `/api/usuarios/:id` | `ADMINISTRADOR` | **Borrado Lógico:** Cambia estado a `'INACTIVO'` | `200`, `401`, `403`, `404` |

### Middlewares de Seguridad
1. **`verifyToken`:** Extrae y valida el token `Authorization: Bearer <JWT_TOKEN>`. Inyecta `req.user = { id, rol, nombre }`.
2. **`checkRole(...allowedRoles)`:** Valida que `req.user.rol` corresponda a los roles permitidos. Si no está autorizado, retorna `403 Forbidden` con el mensaje:
   `"Acceso denegado: Se requieren permisos de Administrador"`.

---

## 6. Frontend: Aplicación SPA (React & Vite)

El cliente web corre por defecto en el puerto `3000` (`http://localhost:3000`).

### Componentes Clave
1. **`AuthContext.jsx`:** Maneja el estado global de autenticación (`user`, `token`, `isAuthenticated`, `isLoading`), sincronizado con `localStorage` (`coop_token`, `coop_user`). Almacena los datos consolidados de la persona (`nombre_completo`, `cui_dpi`, `codigo_planilla`, `rol`, `estado`).
2. **`LoginPage.jsx`:**
   - Diseño corporativo con temática verde esmeralda y azul marino.
   - Formulario reactivo con control de visibilidad de contraseña.
   - Manejo de estados de carga (spinner) y alertas de error dinámicas.
   - **Botones de inicio rápido:** Permiten autocompletar credenciales de Administrador, Operador o Inactivo con un clic.
3. **`ProtectedRoute.jsx`:** Protege las rutas privadas; si no hay sesión activa, redirige automáticamente a `/login`.
4. **`RoleProtectedRoute.jsx`:** Restringe rutas a roles autorizados (ej. `/usuarios` exclusivo para `ADMINISTRADOR`). Si un Operador o Asociado intenta entrar, lo redirige al `/dashboard` mostrando un banner de permiso denegado.
5. **`DashboardPage.jsx`:** 
   - **ADMINISTRADOR:** Visualiza métricas globales (Total de usuarios, activos, borrados lógicos) y botón de acceso a gestión.
   - **OPERADOR / ASOCIADO:** Visualiza exclusivamente su tarjeta de perfil personal institucional con Nombre Completo, DPI / CUI, Código de Planilla, Correo y Rol.
6. **`UsersPage.jsx`:** 
   - **Modal de Formulario 3FN:** Campos normalizados para DPI / CUI, Primer Nombre, Segundo Nombre, Primer Apellido, Segundo Apellido, Teléfono, Dirección, Correo Electrónico, Código de Planilla, Contraseña y Dropdown de Roles.
   - **Tabla 3FN:** Muestra Código de Planilla, DPI / CUI, Nombre Completo, Teléfono, Rol, Estado y Acciones protegidas (Editar / Desactivar vía borrado lógico).


---

## 7. Control de Acceso Basado en Roles (RBAC)

| Módulo / Función | Rol `ADMINISTRADOR` | Rol `OPERADOR` | Rol `ASOCIADO` |
|:---|:---:|:---:|:---:|
| **Iniciar Sesión** | ✅ Permitido | ✅ Permitido | ✅ Permitido *(si está ACTIVO)* |
| **Consultar Perfil Propio (`/me`)** | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Pestaña en Navbar** | ✅ Visible | ❌ Oculta | ❌ Oculta |
| **Acceso a URL `/usuarios`** | ✅ Permitido | ⛔ Redirige a `/dashboard` (403) | ⛔ Redirige a `/dashboard` (403) |
| **Listar Usuarios en API** | ✅ Permitido | ⛔ Bloqueado (403) | ⛔ Bloqueado (403) |
| **Crear / Editar / Desactivar** | ✅ Permitido | ⛔ Bloqueado (403) | ⛔ Bloqueado (403) |
| **Vista en Dashboard** | Métricas Globales y Accesos | Resumen Operativo y Caja | Membresía y Beneficios |

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
2. Ejecutar el script SQL para crear la tabla y cargar los datos iniciales:
   ```bash
   psql -h localhost -U stevenortiz -d cooperativa_db -f backend/database.sql
   ```

---

### Paso 2: Iniciar el Backend
1. Abrir una terminal y navegar al directorio `backend`:
   ```bash
   cd backend
   ```
2. Instalar dependencias (si no se han instalado):
   ```bash
   npm install
   ```
3. Iniciar el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```
   *El servidor quedará disponible en `http://localhost:5000`*.

---

### Paso 3: Iniciar el Frontend
1. Abrir una segunda terminal y navegar al directorio `frontend`:
   ```bash
   cd frontend
   ```
2. Instalar dependencias (si no se han instalado):
   ```bash
   npm install
   ```
3. Iniciar el cliente de desarrollo:
   ```bash
   npm run dev
   ```
   *La aplicación abrirá en `http://localhost:3000`*.

---

## 10. Suites de Pruebas Automatizadas

El proyecto incluye scripts independientes en la carpeta `backend/` para validar el funcionamiento del sistema en cualquier momento:

### 1. Pruebas de Autenticación y JWT (`testAuth.js`)
Valida login exitoso, login con contraseña errónea, login de usuario inactivo, validación de token JWT y rechazo de tokens adulterados:
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
Valida que usuarios con rol `OPERADOR` sean rechazados con código `403` y el mensaje `"Acceso denegado: Se requieren permisos de Administrador"` en todas las rutas de usuarios, mientras que `ADMINISTRADOR` mantiene acceso completo:
```bash
cd backend
node testRBAC.js
```

---

> **Proyecto:** Cooperativa - Sistema de Gestión Integral  
> **Ciclo:** Ciclo 10 - Proyecto de Graduación 2 (UMG)  
> **Año:** 2026
