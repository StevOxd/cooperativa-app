# Sistema de Gestión Integral - Cooperativa (Portal y Backend)

Documento maestro de arquitectura, flujos operativos de negocio, sistema de diseño, modelos de datos relacionales, políticas de seguridad y manual de despliegue en contenedores para el Proyecto de Graduación.

---

## 📑 Tabla de Contenidos
1. [Resumen Ejecutivo y Alcance del Ecosistema](#1-resumen-ejecutivo-y-alcance-del-ecosistema)
2. [Arquitectura de Contenedores Docker y Persistencia](#2-arquitectura-de-contenedores-docker-y-persistencia)
3. [Sistema de Diseño Institucional (Línea Gráfica Azul Corporativo)](#3-sistema-de-diseño-institucional-línea-gráfica-azul-corporativo)
4. [Roles del Sistema (RBAC) - Cero SUPERADMIN](#4-roles-del-sistema-rbac---cero-superadmin)
5. [Flujos Operativos de Usuario por Rol](#5-flujos-operativos-de-usuario-por-rol)
   - 5.1 [Flujo 0: Solicitante Público / Afiliación Digital](#51-flujo-0-solicitante-público--afiliación-digital)
   - 5.2 [Flujo 1: Rol ASOCIADO (Portal Financiero y Saldos Consolidados)](#52-flujo-1-rol-asociado-portal-financiero-y-saldos-consolidados)
   - 5.3 [Flujo 2: Rol OPERADOR (Ventanilla, Padrón y Comprobantes Oficiales)](#53-flujo-2-rol-operador-ventanilla-padrón-y-comprobantes-oficiales)
   - 5.4 [Flujo 3: Rol EJECUTIVO (Comité de Crédito, Scoring y Flujo Financiero)](#54-flujo-3-rol-ejecutivo-comité-de-crédito-scoring-y-flujo-financiero)
   - 5.5 [Flujo 4: Rol ADMINISTRADOR (Centro de Mando, Usuarios y Auditoría)](#55-flujo-4-rol-administrador-centro-de-mando-usuarios-y-auditoría)
   - 5.6 [Módulo Transversal: Servicio de Correo Google y Cero Exposición de Claves](#56-módulo-transversal-servicio-de-correo-google-y-cero-exposición-de-claves)
   - 5.7 [Módulo Transversal: Configuración de Cuenta y Factor 2FA Opcional](#57-módulo-transversal-configuración-de-cuenta-y-factor-2fa-opcional)
6. [Estructura Completa de Base de Datos](#6-estructura-completa-de-base-de-datos)
   - 6.1 [Base de Datos `cooperativa_db` (14 Tablas 3FN)](#61-base-de-datos-cooperativa_db-14-tablas-3fn)
   - 6.2 [Base de Datos `banco_db` (Core Banking de la Corporación)](#62-base-de-datos-banco_db-core-banking-de-la-corporación)
   - 6.3 [Triggers, Funciones y Secuencias Atómicas](#63-triggers-funciones-y-secuencias-atómicas)
   - 6.4 [Optimización de Índices DBA y Cobertura B-Tree](#64-optimización-de-índices-dba-y-cobertura-b-tree)
7. [Reglas de Negocio Financieras y Políticas de Seguridad](#7-reglas-de-negocio-financieras-y-políticas-de-seguridad)
8. [Esquema de Identidad, Nomenclatura y Gestión Segura de Credenciales](#8-esquema-de-identidad-nomenclatura-y-gestión-segura-de-credenciales)
9. [Guía de Despliegue con Docker Compose](#9-guía-de-despliegue-con-docker-compose)
   - 9.1 [Prerrequisitos](#91-prerrequisitos)
   - 9.2 [Comandos de Ejecución](#92-comandos-de-ejecución)
   - 9.3 [Configuración de Secretos y Variables de Entorno](#93-configuración-de-secretos-y-variables-de-entorno)
   - 9.4 [Volúmenes Persistentes y Almacenamiento Seguro de Archivos](#94-volúmenes-persistentes-y-almacenamiento-seguro-de-archivos)
   - 9.5 [Verificación de Conectividad y Endpoints de Salud](#95-verificación-de-conectividad-y-endpoints-de-salud)
10. [Suites de Pruebas Automatizadas (100% Cobertura)](#10-suites-de-pruebas-automatizadas-100-cobertura)

---

## 1. Resumen Ejecutivo y Alcance del Ecosistema

El presente sistema constituye una plataforma bancaria y cooperativa de nivel empresarial orientada a la inclusión financiera, autogestión de ahorros y democratización crediticia. La Cooperativa opera como una entidad filial e integrada dentro de la **Corporación Bancaria**, manteniendo sinergia tecnológica directa con el sistema central del Banco (**Core Banking**).

### Módulos Principales del Ecosistema:

1. **Módulo 1: Afiliación Digital y Presencial (Membresía Cooperativa):**
   - **Escenario 1 (Cliente o Colaborador de la Entidad Bancaria):** Consulta del CUI/DPI contra el Core Banking (sin revelar datos de la persona), autenticación con 3 credenciales de Banca en Línea (usuario, código y contraseña), verificación del correo con un código de 6 dígitos, débito del aporte inicial **solo desde una cuenta del propio titular** y acceso al portal con la contraseña que eligió el solicitante. El personal de la cooperativa no se afilia en línea.
   - **Escenario 2 (Solicitante No Bancarizado / Nuevo):** Verificación matemática y legal estricta de mayoría de edad (18+ años cumplidos), verificación del correo con un código de 6 dígitos, generación de caso correlativo institucional `CASO-AFIL-YYYY-XXXX` mediante trigger en PostgreSQL, envío del número de caso por correo y emisión de comprobante oficial en PDF para formalización en ventanilla.
   - **Ventanilla de Operador:** Bandeja operativa de afiliaciones con bloqueo concurrente atómico (`HTTP 409 Conflict`), Formulario 1 (formalización presencial), Formulario 2 (apertura de cuentas adicionales), Formulario 3 (asignación de beneficiarios con regla estricta del 100.00%) y Expediente Integral 360° (Reporte 1.1).
   - **Comprobante Oficial de Apertura en PDF:** Generación en ventanilla de un comprobante con formato institucional estándar, desglose de operación en caja, acreditación a cuentas y firma/sello digital.

2. **Módulo de Autenticación, Ciberseguridad Bancaria y Notificaciones:**
   - **Cero Exposición de Contraseñas:** Las contraseñas temporales generadas criptográficamente nunca se despliegan en la interfaz del Operador ni del Administrador ni viajan en las respuestas de la API; se envían solo al correo del titular vía Google Mail SMTP. Si el correo no sale, el sistema lo informa al operador o al administrador, y un reinicio de contraseña no se aplica sin un correo que funcione.
   - **Cambio Forzoso de Contraseña en Primer Ingreso:** Todo usuario con contraseña temporal está obligado a cambiar su clave en su primer acceso. Tras el cambio exitoso, el sistema destruye la sesión temporal y redirige formalmente al `/login` para que ingrese con sus nuevas credenciales establecidas.
   - **Doble Factor de Autenticación (2FA TOTP RFC 6238):** Activación voluntaria y autogestionada desde «Seguridad», en el menú del usuario (Google Authenticator / Microsoft Authenticator). El secreto se genera solo al activarlo; la afiliación y el alta de usuarios no lo generan.
   - **Protocolo Anti-Fuerza Bruta:** Tras 3 intentos fallidos consecutivos la cuenta se congela 15 minutos, con desbloqueo administrativo inmediato en 1 solo clic. Todos los fallos responden con el mismo mensaje, exista o no la cuenta; el aviso de cuenta bloqueada (`HTTP 423 Locked`) solo se muestra con la contraseña correcta. Límite de 15 intentos de inicio de sesión cada 15 minutos por conexión.
   - **Respuestas que no revelan cuentas:** El inicio de sesión, la validación de la Banca en Línea y la consulta pública del DPI responden igual exista o no la cuenta, sin datos personales.
   - **Control de Sesión Única Concurrente:** Rechazo de accesos simultáneos (`HTTP 409 Conflict`) y emisión instantánea de alerta de seguridad vía WebSockets en el dispositivo activo original.
   - **Temporizador de Inactividad de 10 Minutos:** Cierre formal de sesión tras 10 minutos continuos sin interacción física, sincronizado entre pestañas del navegador.
   - **Monitor de Presencia en Tiempo Real:** Latidos periódicos ping/pong vía Socket.io (`ultimo_ping` < 2 min).

3. **Módulo de Consulta de Saldos, Estados de Cuenta en PDF y Traslados:**
   - **Arquitectura Financiera Bancaria vs Cooperativa:**
     - La cuenta de ahorro creada al aperturar un socio representa su cuenta en la entidad bancaria externa (`cuentas_bancarias` en Core Banking).
     - De esta cuenta bancaria se debitan fondos para acreditar a sus cuentas dentro de la cooperativa (Aportaciones, Ahorro Corriente, Metas).
     - Cálculo contable transparente en el portal: **Total Cooperativa** (suma de cuentas en la cooperativa) y **Saldo en Cuenta Bancaria Externa** (sincronizada en vivo vía API).
   - **Emisión de Estados de Cuenta Oficiales en PDF:** Formato carta corporativo con membrete bancario, folio único `EDC-<CUENTA>-<TIMESTAMP>`, desglose financiero, tabla paginada de movimientos y sello digital de integridad SHA-256.
   - **Traslados de Nómina:** Débitos controlados desde cuenta de nómina hacia cuentas de ahorro de la cooperativa con correlativo atómico `CASO-YYYY-XXXX` y doble partida contable ACID en el libro mayor.

4. **Módulo de Simulación Crediticia y Gestión de Préstamos:**
   - Simulador interactivo con cuota nivelada constante mediante la fórmula de **Amortización Francesa al 10% anual**.
   - Restricción estatutaria de un máximo de 2 créditos activos simultáneos por asociado.
   - Descarga de formulario prellenado en PDF (`SOLICITUD-CREDITO-YYYY-XXXX.pdf`) y carga de documento firmado.
   - **Bandeja Ejecutiva de Créditos y Scoring:** Visor PDF integrado, motor de scoring crediticio automatizado, columna informativa de sentido de flujo financiero (**CRÉDITO** vs **DÉBITO**) y tres resoluciones ejecutivas exclusivas: Aprobar (desembolso atómico), Devolver a Operador o Denegar.

5. **Módulo de Centro de Mando Administrativo y Auditoría:**
   - KPIs operativos y de seguridad en tiempo real.
   - Gráfica de dona interactiva de distribución por rol y barras semestrales de altas.
   - Monitor de presencia en vivo y tabla de eventos inmutables de auditoría en `historial_estados_usuario`.
   - **Gestión Integral de Usuarios (3FN):** Validaciones estrictas de DPI (13 dígitos numéricos), teléfono (8 dígitos), nombres alfabéticos puros y mayoría de edad obligatoria (18+ años) con cálculo dinámico.
   - Borrado lógico auditado (ACTIVO / INACTIVO con motivo obligatorio) y reactivación de cuentas.

---

## 2. Arquitectura de Contenedores Docker y Persistencia

El sistema está completamente contenedorizado y orquestado mediante **Docker Compose**, distribuyendo las cargas de trabajo en cuatro servicios aislados comunicados mediante la red bridge interna `cooperativa-net`:

```
+---------------------------------------------------------------------------------------+
|                             DOCKER COMPOSE (cooperativa-net)                          |
|                                                                                       |
|  [cooperativa-frontend]          [cooperativa-backend]           [cooperativa-db]     |
|  Nginx 1.27 Alpine               Node.js 20 Alpine               PostgreSQL 16        |
|  Puerto Host: 3000               Puerto Host: 5001               127.0.0.1:5432       |
|  (SPA React 18 + Vite)           (API REST + WebSockets + Mail)  (cooperativa_db &    |
|        │                               │                          banco_db)           |
|        │                               │                               │              |
|        └──────── Proxy HTTP /ws ───────┴──────── Pool TCP (5432) ──────┘              |
|                                        │                                              |
|                                  HTTP  │ (Timeout 5s)                                 |
|                                  REST  ▼                                              |
|                              [banco-backend]                                          |
|                              Node.js 20 Alpine                                        |
|                              127.0.0.1:5002 (solo local)                              |
|                              (Core Banking API Mock)                                  |
+---------------------------------------------------------------------------------------+
```

### Detalle de los 4 Contenedores:

| Contenedor | Servicio | Imagen Base | Puerto Host | Puerto Contenedor | Variables de Entorno Clave | Propósito y Características |
|:---|:---|:---|:---:|:---:|:---|:---|
| `cooperativa-frontend` | `frontend` | `nginx:1.27-alpine` | `3000` | `80` | `VITE_API_URL=/api`, `VITE_SOCKET_URL=/` | Servidor web Nginx que sirve la SPA compilada. Actúa como proxy inverso de `/api/` y WebSockets `/socket.io/`. |
| `cooperativa-backend` | `backend` | `node:20-alpine` | `5001` | `5000` | `PORT=5000`, `DB_NAME=cooperativa_db`, `BANCO_API_URL=http://banco-backend:5002`, `BANCO_INTERNAL_API_KEY`, `JWT_SECRET`, `JWT_EXPIRES_IN=8h`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_ENABLED` | API REST principal en Express.js, servicio Socket.io y despachador de correo Google Mail. Usa `dumb-init` como PID 1. No arranca si falta `JWT_SECRET` o `BANCO_INTERNAL_API_KEY`. |
| `banco-backend` | `banco-backend` | `node:20-alpine` | `127.0.0.1:5002` | `5002` | `PORT=5002`, `DB_NAME=banco_db`, `BANCO_INTERNAL_API_KEY` | Servidor simulador del Core Banking de la Corporación Bancaria. Expone endpoints bajo `/api/banco/v1/*` protegidos por API Key inter-servicio. Se publica solo en esta máquina; el backend llega por la red interna. No arranca sin `BANCO_INTERNAL_API_KEY`. |
| `cooperativa-db` | `db` | `postgres:16-alpine` | `127.0.0.1:5432` | `5432` | `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (tomados de `DB_USER`, `DB_PASSWORD`, `DB_NAME`) | Motor relacional PostgreSQL que aloja simultáneamente `cooperativa_db` y `banco_db`. Volumen persistente `cooperativa_db_data`. Se publica solo en esta máquina, para las pruebas locales. |

### Bind Mount y Almacenamiento Seguro de Archivos PDF (SEC-02):
- El servicio `cooperativa-backend` monta el volumen tipo *bind mount*:
  ```yaml
  volumes:
    - ./backend/uploads:/app/uploads
  ```
- **Almacenamiento Físico:** Almacena de forma persistente los comprobantes de afiliación (`uploads/afiliaciones/`), los comprobantes de apertura de cuenta y las solicitudes de crédito firmadas (`uploads/creditos/`).
- **Entrega Segura de Archivos (RBAC):** Se erradicó la entrega estática pública (`express.static`). Las descargas se canalizan por el endpoint protegido `GET /api/uploads/:subfolder/:filename`, validando token JWT y control de acceso RBAC.

---

## 3. Sistema de Diseño Institucional (Línea Gráfica Azul Corporativo)

> [!IMPORTANT]
> **Aclaración Institucional de la Paleta Cromática (Cero Verde):**
> La identidad visual oficial de la Cooperativa **NO ES VERDE**. Toda sugerencia de utilizar tonalidades verdes ha sido formalmente desestimada en favor de una estética bancaria moderna, sobria y de alta confiabilidad basada en **Azul Corporativo Suave, Pizarra y Azul Financiero** (`Sky / Slate`).

### 3.1 Paleta de Colores Corporativos

| Nombre Semántico | Token Tailwind | Código Hex | Uso Institucional |
|:---|:---|:---:|:---|
| **Azul Corporativo 700** | `coop-700` | `#0369a1` | Color principal de botones de acción, encabezados de tablas y destacados. |
| **Azul Corporativo 800** | `coop-800` | `#075985` | Hover de botones institucionales, barras de navegación y branding primario. |
| **Azul Corporativo 900** | `coop-900` | `#0c4a6e` | Textos de máximo contraste, títulos principales y encabezados oscuros. |
| **Azul Financiero Sky** | `sky-600` / `sky-500` | `#0284c7` / `#0ea5e9` | Badges de cuentas, hipervínculos, indicadores de paso e íconos interactivos. |
| **Gris Pizarra Fondo** | `slate-50` | `#f8fafc` | Fondo general de la aplicación, descansos visuales y tarjetas claras. |
| **Gris Pizarra Borde** | `slate-200` | `#e2e8f0` | Delimitadores de tablas, tarjetas y líneas divisorias sutiles. |
| **Gris Pizarra Texto** | `slate-800` / `slate-900` | `#1e293b` / `#0f172a` | Tipografía principal de lectura y datos financieros. |
| **Alerta / Pendiente** | `amber-500` / `amber-600` | `#f59e0b` / `#d97706` | Badges de estados pendientes, advertencias de intento y bloqueos por fuerza bruta. |
| **Peligro / Rechazo / Débito** | `rose-600` / `rose-700` | `#e11d48` / `#be123c` | Rechazo de créditos, eliminación lógica, insignia de DÉBITO y alertas de error. |
| **Éxito / Aprobado / Crédito** | `emerald-600` / `emerald-700` | `#059669` / `#047857` | Indicadores de cuenta aprobada, insignia de CRÉDITO e indicador de 18+ años. |

### 3.2 Componentes de Experiencia de Usuario (UX/UI) y Accesibilidad
1. **`ConfirmModal.jsx`:** Modal institucional accesible con backdrop desenfocado, soporte de tecla Escape y resumen descriptivo de la acción.
2. **`useToast.jsx`:** Notificaciones flotantes no intrusivas tipo socket con auto-cierre a los 4 segundos.
3. **`TableSkeleton.jsx`:** Animación de carga `animate-pulse` que previene saltos bruscos de diseño (*CLS*).
4. **Contadores de Validación en Tiempo Real:** Los campos numéricos estrictos (DPI `X/13` y Teléfono `X/8`) muestran contadores interactivos que cambian de gris a verde esmeralda al completarse.
5. **Insignia Dinámica de Mayoría de Edad:** Al ingresar la fecha de nacimiento, el sistema calcula la edad exacta y exhibe una insignia (`✓ XX años cumplidos` o `⚠ Menor de edad`).

---

## 4. Roles del Sistema (RBAC) - Cero SUPERADMIN

> [!CAUTION]
> **Exclusión Terminante del Rol `SUPERADMIN`:**
> El rol `SUPERADMIN` ha sido completamente eliminado del sistema, de la base de datos relacional y de los controladores. La administración superior recae única y exclusivamente sobre el rol `ADMINISTRADOR`.

El sistema opera bajo un modelo estricto de Control de Acceso Basado en Roles (**RBAC**):

```
+---------------------------------------------------------------------------------+
|                        ROLES DEL SISTEMA COOPERATIVO                            |
+-------------------+-------------------------------------------------------------+
| ADMINISTRADOR     | Gestión de colaboradores, desbloqueos, monitor de presencia |
|                   | y auditoría inmutable de eventos de seguridad.              |
+-------------------+-------------------------------------------------------------+
| OPERADOR          | Atención en ventanilla, formalización de padrón, emisión    |
|                   | de comprobantes, resolución de traslados y triaje de crédito|
+-------------------+-------------------------------------------------------------+
| EJECUTIVO         | Evaluación colegiada de créditos, motor de scoring          |
|                   | crediticio y resolución resolutiva con desembolso atómico.  |
+-------------------+-------------------------------------------------------------+
| ASOCIADO          | Portal financiero de autogestión, consulta de saldos        |
|                   | consolidados, traslados de nómina y solicitud de préstamos. |
+-------------------+-------------------------------------------------------------+
```

### Matriz de Permisos y Acceso por Componente:

| Módulo / Funcionalidad | Solicitante | Rol `ASOCIADO` | Rol `OPERADOR` | Rol `EJECUTIVO` | Rol `ADMINISTRADOR` |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Consulta Previa por DPI** | ✅ Público | ❌ N/A | ❌ N/A | ❌ N/A | ❌ N/A |
| **Afiliación Digital (Esc. 1 y 2)** | ✅ Público | ❌ N/A | ❌ N/A | ❌ N/A | ❌ N/A |
| **Inicio de Sesión Corporativo** | ❌ No | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| **Portal Financiero del Asociado** | ❌ No | ✅ Exclusivo | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado |
| **Simulador de Crédito Francés** | ❌ No | ✅ Exclusivo | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado |
| **Subir Solicitud Firmada (PDF)** | ❌ No | ✅ Exclusivo | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado |
| **Bandeja de Afiliaciones en Agencia** | ❌ No | ❌ Bloqueado | ✅ Exclusivo | ❌ Bloqueado | ❌ Bloqueado |
| **Padrón de Asociados y Cuentas** | ❌ No | ❌ Bloqueado | ✅ Exclusivo | ❌ Bloqueado | ❌ Bloqueado |
| **Descarga de Comprobante Apertura** | ❌ No | ❌ Bloqueado | ✅ Exclusivo | ❌ Bloqueado | ❌ Bloqueado |
| **Bandeja de Traslados de Nómina** | ❌ No | ❌ Bloqueado | ✅ Exclusivo | ❌ Bloqueado | ❌ Bloqueado |
| **Bandeja Colegiada de Créditos** | ❌ No | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo | ❌ Bloqueado |
| **Motor de Scoring e Historial Flujos**| ❌ No | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo | ❌ Bloqueado |
| **Aprobación y Desembolso de Créditos**| ❌ No | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo | ❌ Bloqueado |
| **Centro de Mando Administrativo** | ❌ No | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo |
| **Creación/Edición Usuarios con Val.** | ❌ No | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo |
| **Reinicio Seguro de Contraseña** | ❌ No | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo |
| **Desbloqueo en 1 Clic (Anti-Fuerza)** | ❌ No | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo |
| **Auditoría Inmutable de Seguridad** | ❌ No | ❌ Bloqueado | ❌ Bloqueado | ❌ Bloqueado | ✅ Exclusivo |

---

## 5. Flujos Operativos de Usuario por Rol

### 5.1 Flujo 0: Solicitante Público / Afiliación Digital

Disponible en `/registro-asociado` sin autenticación previa:

```
[Inicio: Consulta DPI] ──▶ ¿Registrado en Core Banking?
                             │
            ┌────────────────┴────────────────┐
            ▼ (SÍ)                            ▼ (NO)
    [ESCENARIO 1: Banco]              [ESCENARIO 2: Agencia]
  • Autenticación Banca en Línea     • Verificación 18+ Años
  • Selección Cuenta Ahorro (propia) • Código de verificación al correo
  • Aporte Inicial (Mín. Q100)       • Trigger CASO-AFIL-YYYY-XXXX
  • Contraseña elegida (8+ símbolos) • Número de caso por correo y PDF
  • Código de verificación al correo • Visita a Ventanilla Operador
  • Débito ACH + Crédito Coop
```

#### Paso a Paso Detallado:
1. **Ingreso y Consulta de CUI/DPI:** Validación de formato (13 dígitos numéricos) y consulta protegida con timeout preventivo hacia el Core Banking. La respuesta solo indica el camino a seguir: no incluye el nombre, el tipo de cliente, si ya es asociado ni si tiene cuentas activas. Tope de 30 consultas cada 15 minutos por conexión.
2. **ESCENARIO 1 (Cliente Bancario o Colaborador de Nómina):**
   - Validación de las 3 credenciales de Banca en Línea (usuario, código de cliente y contraseña), con un único mensaje de error. Al validarse, el servidor emite un comprobante firmado de 15 minutos válido solo para ese DPI y sus cuentas; sin él no se puede completar la afiliación.
   - «Ya es asociado» y «no tiene cuentas activas» se informan después de esta validación. El personal de la cooperativa (operador, ejecutivo, administrador) no puede afiliarse en línea.
   - El solicitante elige su contraseña del portal (política de la sección 7) y confirma su correo con un código de 6 dígitos antes del débito.
   - Débito ACH desde una cuenta bancaria **del propio titular** (lo verifican la cooperativa y el banco) y creación de la cuenta de aportaciones. Si la persona ya tenía usuario, conserva su contraseña, su rol y su 2FA.
3. **ESCENARIO 2 (Solicitante No Bancarizado / Persona Particular):**
   - Validación matemática de mayoría de edad (mínimo 18 años cumplidos).
   - Verificación del correo con un código de 6 dígitos antes de crear el caso.
   - Generación del caso institucional `CASO-AFIL-YYYY-XXXX` mediante trigger atómico en PostgreSQL, envío del número de caso por correo y descarga del comprobante en PDF para formalización presencial en ventanilla.
4. **Código de verificación del correo:** Se guarda solo su hash; vence en 10 minutos, admite 5 intentos, permite reenvío a los 60 segundos (máximo 5 por hora por correo y 10 cada 15 minutos por conexión) y se consume en la misma operación que la afiliación. Si el correo de la cooperativa no funciona, se le pide al solicitante intentar más tarde o acudir a una agencia.

---

### 5.2 Flujo 1: Rol ASOCIADO (Portal Financiero y Saldos Consolidados)

```
[Login] ──▶ ¿Contraseña Temporal?
                 │
  ┌──────────────┴──────────────┐
  ▼ (SÍ)                        ▼ (NO)
[Cambio Forzoso de Clave]     [Portal Financiero del Asociado]
  │                             │
  ▼                             ├─▶ Total Cooperativa vs Cuenta Bancaria
[Redirección a /login]          ├─▶ Descarga de Estado de Cuenta Oficial (PDF)
                                ├─▶ Traslado desde Cuenta Nómina (CASO-YYYY-XXXX)
                                └─▶ Simulador Amortización Francesa (Tope 2 Créditos)
```

#### 1. Primer Ingreso y Cambio Obligatorio de Contraseña:
- Al iniciar sesión con una contraseña temporal generada por el sistema, se abre un diálogo modal de **Cambio Obligatorio de Contraseña**.
- El asociado debe ingresar su contraseña temporal actual y definir su nueva contraseña personal (mínimo 8 caracteres, con letras, números y al menos un símbolo).
- Quien se afilió en línea eligió su propia contraseña y no pasa por este cambio.
- Al confirmar el cambio exitoso, el sistema destruye la sesión temporal y redirige al usuario formalmente a `/login`, permitiéndole ingresar con su nueva contraseña establecida.

#### 2. Consulta de Balances y Arquitectura de Cuentas:
- **Total Cooperativa:** Agrupa y totaliza los saldos disponibles en las cuentas aperturadas en la cooperativa (Cuenta de Aportaciones, Ahorro Corriente y Cuentas de Metas). Formateo numérico protegido contra valores nulos o `NaN`.
- **Cuenta Bancaria Externa Vinculada:** Refleja la cuenta de ahorro aperturada en la entidad bancaria aliada con su saldo real sincronizado vía API de Core Banking.
- **Cartola de Movimientos y Estado de Cuenta en PDF:** Emisión en 1 solo clic del Estado de Cuenta oficial en PDF (`ESTADO-CUENTA-<CUENTA>-<FECHA>.pdf`), con membrete bancario, folio único `EDC-<CUENTA>-<TIMESTAMP>`, tarjetas informativas, desglose transaccional y sello digital SHA-256.

#### 3. Traslados de Nómina y Créditos:
- Traslados de nómina con generación correlativa `CASO-YYYY-XXXX` para autorización del operador.
- Simulador de crédito con Amortización Francesa al 10% anual, tope estatutario de 2 créditos simultáneos y carga de solicitud firmada en PDF.

---

### 5.3 Flujo 2: Rol OPERADOR (Ventanilla, Padrón y Comprobantes Oficiales)

```
[Login Operador (OP-X)] ──▶ [Operator Dashboard]
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
[Bandeja Afiliaciones]    [Bandeja Traslados]         [Padrón de Asociados]
• Bloqueo HTTP 409        • Revisión CASO-YYYY-XXXX   • Búsqueda y Paginación
• Formulario 1            • Aprobación/Rechazo        • Formulario 2 (Cuentas)
• Clasificación Auto DPI  • Transacción ACID          • Formulario 3 (Beneficiarios 100%)
• Cero Clave en Pantalla  • Débito/Crédito Libro      • Expediente 360° (Rep. 1.1)
• Despacho Correo Google                              • Comprobante Apertura PDF
```

#### 1. Bandeja de Afiliaciones en Ventanilla (Módulo 1):
- Bloqueo concurrente atómico con respuesta `HTTP 409 Conflict` si otro operador atiende el caso simultáneamente.
- **Formalización Presencial (Formulario 1):**
  - **Detección y Clasificación Autónoma por DPI:** Al ingresar el DPI del solicitante, el sistema consulta de forma transparente al Core Banking (:5002) y clasifica automáticamente el tipo de asociado (`EB-X` para Empleado Bancario de nómina o `EX-X` para Cliente Externo/Particular), prescindiendo de selectores manuales propensos a errores.
  - **Gestión Financiera de Apertura:** Método de pago predeterminado en efectivo en ventanilla (`EFECTIVO_VENTANILLA`) con aporte inicial mínimo de Q100.00. Para asociados externos (`EX`), se apertura automáticamente una cuenta de ahorro en la entidad bancaria aliada (`banco_db`). Para colaboradores bancarios (`EB`), se consultan y exhiben sus cuentas existentes, habilitando la opción de acreditar saldo a sus cuentas bancarias en caso de fondos insuficientes.
  - **Selector Estructurado de Fecha de Nacimiento:** Componente unificado de triple selector (Día, Mes, Año) estandarizado con el portal público, con insignia en tiempo real de mayoría de edad legal (18+ años cumplidos).
  - **Validaciones Rigurosas de Entrada:** Restricción estricta de DPI a 13 dígitos numéricos, teléfono a exactamente 8 dígitos (bloqueando caracteres no numéricos y longitudes mayores), y comprobación en tiempo real de correos duplicados.
  - **Control de Modificación y Envío Único:** El botón de registro permanece inactivo si no se han realizado cambios y se bloquea contra doble clic accidental.
  - **Cero Exposición de Contraseña y Proceso Desatendido:** Se eliminó cualquier interruptor manual de "Habilitar credenciales web"; la cuenta de usuario se aprovisiona automáticamente y la contraseña temporal autogenerada criptográficamente se envía al correo del titular, después de guardar la afiliación, sin mostrarse al operador. Si el correo no sale, la afiliación queda hecha y el operador ve el aviso «El asociado no recibió su acceso al portal».
  - **Operaciones con el banco:** Las consultas de cuentas por DPI, la acreditación y la apertura de cuentas en el banco (`/api/banco-externo`) exigen sesión de operador.
  - **Comprobante Oficial de Apertura en PDF:** El operador genera y descarga el comprobante en PDF de la cuenta aperturada en ventanilla, detallando la operación de caja, acreditación inicial de fondos y firma/sello institucional.

#### 2. Gestión de Créditos en Ventanilla (Rol Operador):
- **Obligatoriedad de PDF Firmado:** Para solicitudes de crédito evaluadas por ventanilla, el operador no puede aceptar ni elevar la solicitud al Comité de Crédito sin haber adjuntado obligatoriamente el documento PDF con la firma manuscrita del asociado.

#### 3. Bandeja de Traslados y Padrón 360°:
- Aprobación contable en doble partida de traslados de nómina.
- Formulario 2 de cuentas adicionales y Formulario 3 de beneficiarios con estricta validación del **100.00%**. Al abrir una cuenta con fondos del banco, la cuenta bancaria debe ser del propio asociado y la apertura solo se completa si el débito se confirma.
- Expediente Integral 360° (Reporte 1.1) con vista biográfica, financiera y crediticia del asociado.

---

### 5.4 Flujo 3: Rol EJECUTIVO (Comité de Crédito, Scoring y Flujo Financiero)

```
[Login Ejecutivo (EJ-X)] ──▶ [Executive Dashboard]
                                    │
                                    ▼
                      [Bandeja Colegiada de Créditos]
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
  [Visor PDF Firmado]      [Motor de Scoring]       [Resolución Ejecutiva]
  • Contrato escaneado     • Capacidad de pago      • APROBAR (Desembolso)
  • Carga PDF Obligatorio  • Tabla Transacciones    • DEVOLVER (Obs. Requerida)
  • RBAC /api/uploads      • Columna TIPO (Flujo)   • DENEGAR (Justificación)
```

#### 1. Bandeja y Visor Documental Protegido:
- Acceso al PDF escaneado con firma manuscrita mediante token seguro en `/api/uploads/creditos/:filename`.
- Verificación estricta de presencia del documento firmado antes de autorizar la resolución final.

#### 2. Motor de Scoring y Columna "TIPO" de Flujo Financiero:
- En la tabla de **Historial de Transacciones del Solicitante**, se proyecta la columna **"TIPO"**:
  - **`CRÉDITO` (Insignia Verde Esmeralda):** Ingresos, depósitos y abonos de fondos a la cuenta.
  - **`DÉBITO` (Insignia Roja Coral):** Egresos, retiros, pagos y salidas de fondos.
  - **Utilidad Crediticia:** Permite al ejecutivo evaluar de forma instantánea si el asociado mantiene ingresos recurrentes y estables (liquidez y solvencia) o egresos elevados, determinando su capacidad real de pago.

#### 3. Resoluciones Exclusivas:
- **Aprobar:** Desembolso atómico, apertura de cuenta crediticia y acreditación en cuenta de ahorro del asociado.
- **Devolver a Operador:** Envío con observaciones obligatorias para subsanación documental en ventanilla.
- **Denegar:** Archivo inmutable con justificación obligatoria.

---

### 5.5 Flujo 4: Rol ADMINISTRADOR (Centro de Mando, Usuarios y Auditoría)

```
[Login Administrador (AD-X)] ──▶ [Admin Dashboard]
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
  [Centro de Mando KPIs]      [Monitor de Presencia]       [Gestión Usuarios 3FN]
  • 4 Tarjetas en tiempo real • WebSockets en vivo         • Validaciones Estrictas
  • Gráfica Dona RBAC         • Ping/Pong cada 30s         • Fecha Nacimiento (18+ Años)
  • Barras Altas Semestrales  • Auditoría Forense          • Clave Criptográfica por Correo
                              • IP y User-Agent            • Cero Clave en Pantalla
```

#### 1. Limpieza de Interfaz y Gobernanza:
- Se eliminaron botones redundantes en la cabecera del Admin (`[Mi Seguridad]` y `[Correo Google]`). La seguridad personal del administrador se gestiona de manera centralizada desde su avatar en la barra de navegación superior.

#### 2. Creación y Edición de Usuarios con Validaciones Estrictas:
El modal de creación/edición de colaboradores implementa el estándar riguroso de la institución:
- **DPI / CUI:** Exactamente 13 dígitos numéricos, bloqueo de caracteres no numéricos y contador dinámico `X/13`.
- **Teléfono:** Exactamente 8 dígitos numéricos con contador `X/8`.
- **Nombres y Apellidos:** Restricción exclusiva a caracteres alfabéticos (con tildes y diéresis), bloqueando números y símbolos. Mínimo 2 caracteres.
- **Fecha / Año de Nacimiento y Mayoría de Edad:** Campo con calendario, cálculo de edad en tiempo real (`calculateAgeInfo`) y validación obligatoria de mayoría de edad (mínimo 18 años cumplidos).
- **Asignación Automática de Código:** Correlativo institucional según el perfil seleccionado (`EJ-X`, `OP-X`).
- **Generación Criptográfica de Contraseña:** La contraseña temporal no se asigna a mano, no se exhibe en pantalla ni viaja en la respuesta de la API; el servidor la genera de forma aleatoria y la despacha al correo electrónico del nuevo colaborador. Si el correo no sale, se avisa al administrador.

#### 3. Reinicio Seguro de Contraseñas y Desbloqueo en 1 Clic:
- Al reiniciar la contraseña de cualquier usuario, el sistema genera una nueva clave temporal criptográfica y la envía al correo del usuario. No se expone al administrador. Si el correo de la cooperativa no está funcionando, el reinicio no se aplica y se conserva la contraseña actual; si el envío falla, el cambio se deshace.
- Desbloqueo administrativo inmediato de cuentas bloqueadas por fuerza bruta con restablecimiento a 0 intentos y registro en auditoría forense (`historial_estados_usuario`).

---

### 5.6 Módulo Transversal: Servicio de Correo Google y Cero Exposición de Claves

El sistema integra un servicio de mensajería electrónica corporativa en [`mailerService.js`](backend/src/services/mailerService.js) conectado vía **Google Mail SMTP**:

- **Credenciales Seguras:** Autenticación mediante contraseña de aplicación de Google (`GMAIL_APP_PASSWORD`) sobre TLS (puerto 465). `MAIL_ENABLED=false` apaga todo envío (pruebas).
- **Envío real o no:** Los envíos devuelven si el correo salió de verdad (`mailerService.wasSent`), y los flujos lo informan (`correo_enviado`). Los registros del servidor nunca incluyen contraseñas, códigos ni secretos.
- **Plantillas HTML Institucionales:** Correos con diseño responsivo, membrete azul corporativo, identificación del código de usuario, credenciales temporales resaltadas, fecha y recomendaciones de seguridad bancaria.
- **Casos de Uso de Despacho:**
  1. Alta de nuevo asociado formalizado en ventanilla (código `EX-X` y clave temporal).
  2. Creación de nuevo colaborador institucional por parte del Administrador (código `EJ-X` o `OP-X` y clave temporal).
  3. Reinicio administrativo de contraseña para cualquier usuario del sistema.
  4. Afiliación en línea: código de verificación del correo, bienvenida con el código de usuario (sin contraseña, porque la eligió el solicitante) y número de caso de la solicitud en agencia.
- **Protección Cero Exposición:** Erradica el riesgo de espionaje visual (*shoulder surfing*) o filtraciones internas al no mostrar contraseñas generadas en la pantalla del operador ni del administrador.

---

### 5.7 Módulo Transversal: Configuración de Cuenta y Factor 2FA Opcional

- **Menú Simplificado:** Se eliminó la opción redundante *"Cambiar Contraseña"* del menú desplegable del Navbar. Ahora la opción unificada es **"Seguridad & Doble Factor (2FA)"**.
- **Voluntariedad:** El enrolamiento de 2FA TOTP (RFC 6238) es completamente voluntario y autogestionado desde el perfil. No se exige de manera forzosa al iniciar sesión por primera vez. El secreto se genera al iniciar la activación y se confirma con un código antes de guardarse; al desactivarlo se borra.
- **Funcionalidades del Modal:**
  - Pestaña 1: Configuración, activación con código QR y desactivación protegida de 2FA TOTP.
  - Pestaña 2: Cambio voluntario de contraseña validando la contraseña actual.
  - Pestaña 3: Consulta y actualización de datos personales y teléfono de contacto.

---

## 6. Estructura Completa de Base de Datos

PostgreSQL 16 gestiona dos bases de datos relacionales: `cooperativa_db` (entidad cooperativa) y `banco_db` (Core Banking de la corporación).

### 6.1 Base de Datos `cooperativa_db` (15 Tablas 3FN)

```
                                  +-------------------+
                                  |     personas      |
                                  +-------------------+
                                  | id_persona (PK)   |
                                  | cui_dpi (UQ)      |
                                  | nombre_completo   |
                                  | fecha_nacimiento  |
                                  +---------+---------+
                                            |
                   ┌────────────────────────┴────────────────────────┐
                   ▼ 1:1                                             ▼ 1:1
        +-----------------------+                         +-----------------------+
        |       usuarios        |                         |       asociados       |
        +-----------------------+                         +-----------------------+
        | id_persona (PK, FK)   |                         | id_asociado (PK)      |
        | id_rol (FK)           |                         | id_persona (FK, UQ)   |
        | codigo_corporativo(UQ)|                         | fecha_ingreso         |
        | password_hash         |                         +-----------+-----------+
        | primer_ingreso        |                                     |
        | mfa_secret, mfa_enab  |                                     ▼ 1:N
        | intentos_fallidos     |                         +-----------------------+
        | bloqueado_hasta       |                         |        cuentas        |
        | sesion_activa_id      |                         +-----------------------+
        +-----------------------+                         | id_cuenta (PK)        |
                                                          | id_asociado (FK)      |
                                                          | id_tipo_cuenta (FK)   |
                                                          | numero_cuenta (UQ)    |
                                                          | saldo_disponible      |
                                                          | saldo_reserva         |
                                                          +-----------+-----------+
                                                                      |
                                     ┌────────────────────────────────┴────────────────────────────────┐
                                     ▼ 1:N                                                             ▼ 1:N
                          +-----------------------+                                         +-----------------------+
                          |     transacciones     |                                         |     beneficiarios     |
                          +-----------------------+                                         +-----------------------+
                          | id_transaccion (PK)   |                                         | id_beneficiario (PK)  |
                          | id_cuenta (FK)        |                                         | id_cuenta (FK)        |
                          | tipo_transaccion      |                                         | porcentaje (100.00%)  |
                          | monto                 |                                         +-----------------------+
                          | saldo_nuevo           |
                          +-----------------------+
```

#### Diccionario de Tablas:

1. **`roles`:** Catálogo de roles del sistema (`ADMINISTRADOR`, `OPERADOR`, `EJECUTIVO`, `ASOCIADO`).
2. **`permisos`:** Catálogo granular de operaciones del sistema.
3. **`roles_permisos`:** Asignación N:M de permisos a roles.
4. **`personas`:** Entidad biográfica y única fuente de verdad humana.
   - `id_persona` (SERIAL PK), `cui_dpi` (VARCHAR(20) UNIQUE NOT NULL), `primer_nombre` (VARCHAR(50) NOT NULL), `segundo_nombre` (VARCHAR(50)), `primer_apellido` (VARCHAR(50) NOT NULL), `segundo_apellido` (VARCHAR(50)), `nombre_completo` (VARCHAR(255) STORED), `telefono` (VARCHAR(20)), `direccion` (TEXT), `fecha_nacimiento` (DATE NOT NULL), `fecha_creacion` (TIMESTAMP WITH TIME ZONE).
5. **`usuarios`:** Credenciales de acceso, control de concurrencia y seguridad.
   - `id_persona` (INT PK FK personas), `id_rol` (INT FK roles), `codigo_corporativo` (VARCHAR(30) UNIQUE NOT NULL), `email` (VARCHAR(150) UNIQUE NOT NULL), `password_hash` (VARCHAR(255) NOT NULL), `debe_cambiar_password` (BOOLEAN DEFAULT FALSE), `estado` (VARCHAR(20) DEFAULT 'ACTIVO'), `intentos_fallidos` (INT DEFAULT 0), `bloqueado_hasta` (TIMESTAMP WITH TIME ZONE), `sesion_activa_id` (VARCHAR(255)), `ultimo_ping` (TIMESTAMP WITH TIME ZONE), `mfa_secret` (VARCHAR(64)), `mfa_enabled` (BOOLEAN DEFAULT FALSE).
6. **`historial_estados_usuario`:** Registro inmutable de auditoría forense (SEC-09).
   - `id_historial_estado` (SERIAL PK), `id_usuario_modificado` (INT FK usuarios), `estado_anterior`, `estado_nuevo`, `id_modificado_por` (INT FK usuarios), `motivo` (TEXT), `ip_origen` (VARCHAR(45)), `user_agent` (TEXT), `fecha_cambio` (TIMESTAMP WITH TIME ZONE).
7. **`asociados`:** Padrón formal de socios de la cooperativa.
   - `id_asociado` (SERIAL PK), `id_persona` (INT UNIQUE FK personas), `fecha_ingreso` (TIMESTAMP WITH TIME ZONE), `estado_asociado` (VARCHAR(20) DEFAULT 'ACTIVO').
8. **`tipos_cuenta`:** Catálogo de productos financieros (Aportaciones, Ahorro Corriente, Metas, Planilla, Crédito).
9. **`cuentas`:** Cuentas aperturadas por los asociados.
   - `id_cuenta` (SERIAL PK), `numero_cuenta` (VARCHAR(30) UNIQUE NOT NULL), `id_asociado` (INT FK asociados), `id_tipo_cuenta` (INT FK tipos_cuenta), `saldo_disponible` (NUMERIC(14,2) DEFAULT 0.00), `saldo_reserva` (NUMERIC(14,2) DEFAULT 0.00), `estado` (VARCHAR(20) DEFAULT 'ACTIVA').
10. **`beneficiarios`:** Distribución testamentaria de las cuentas del socio (`porcentaje` con regla estricta de suma = 100.00%).
11. **`solicitudes_afiliacion_agencia`:** Solicitudes emitidas por personas no bancarizadas (Escenario 2).
    - `id_solicitud` (SERIAL PK), `numero_caso` (VARCHAR(30) UNIQUE NOT NULL), `cui_dpi`, `primer_nombre`, `primer_apellido`, `fecha_nacimiento` (DATE NOT NULL), `monto_estimado`, `estado` (PENDIENTE_AGENCIA, ATENDIDA, CANCELADA), `id_operador_bloqueo` (INT FK usuarios), `fecha_bloqueo`.
12. **`solicitudes_traslado_apertura`:** Casos de traslado de nómina a ahorro (`numero_caso` formato `CASO-YYYY-XXXX`).
13. **`solicitudes_credito`:** Préstamos radicados por los asociados (`monto_solicitado`, `plazo_meses`, `cuota_mensual_estimada`, `documento_firmado_url`, `id_ejecutivo_resuelve`).
14. **`transacciones`:** Libro mayor contable de doble partida (`tipo_transaccion`, `monto`, `saldo_anterior`, `saldo_nuevo`, `referencia`).
15. **`codigos_verificacion_correo`:** Códigos de 6 dígitos de la afiliación en línea (`email` PK, `codigo_hash`, `expira_en`, `intentos`, `enviado_en`, `envios_hora`, `ventana_inicio`). Solo guarda el hash; la crea `migrations.js` al arrancar el backend.

---

### 6.2 Base de Datos `banco_db` (Core Banking de la Corporación)

Gestionada por el microservicio `banco-backend` (:5002):
1. **`clientes_banco`:** Padrón de clientes y empleados de la Entidad Bancaria (`cui_dpi`, `tipo_cliente` ['EMPLEADO_PLANILLA', 'CLIENTE_EXTERNO'], `estado`).
2. **`cuentas_bancarias`:** Cuentas de ahorro y monetarias del Core Bancario (`numero_cuenta`, `tipo_cuenta`, `saldo_disponible`, `saldo_reserva`).
3. **`usuarios_banca_en_linea`:** Credenciales de Banca en Línea para validación en 3 factores (`nombre_usuario`, `codigo_bancario`, `password_hash`).
4. **`movimientos_bancarios`:** Libro contable de movimientos bancarios y débitos ACH (`tipo_movimiento` ['DEBITO_ACH_COOPERATIVA', 'DEPOSITO', 'RETIRO', etc.]).

---

### 6.3 Triggers, Funciones y Secuencias Atómicas

1. **Trigger de Casos de Traslado (`trg_set_numero_caso`):** Secuencia atómica `seq_numero_caso_traslado` (`CASO-YYYY-XXXX`).
2. **Trigger de Casos de Afiliación en Agencia (`trg_set_numero_caso_afiliacion`):** Secuencia atómica `seq_numero_caso_afiliacion` (`CASO-AFIL-YYYY-XXXX`).

---

### 6.4 Optimización de Índices DBA y Cobertura B-Tree

- **Cobertura Completa de Claves Foráneas (10 Índices B-Tree):** Índices explícitos sobre todas las llaves foráneas (`id_cuenta`, `id_asociado`, `id_persona`, `id_tipo_cuenta`, etc.), eliminando lecturas secuenciales completas (*Sequential Scans*).
- **Índices Parciales Ultraligeros:**
  - `idx_solicitudes_afiliacion_pendientes` sobre `solicitudes_afiliacion_agencia(fecha_solicitud ASC) WHERE estado = 'PENDIENTE_AGENCIA'`.
  - `idx_solicitudes_traslado_pendientes` sobre `solicitudes_traslado_apertura(fecha_solicitud ASC) WHERE estado = 'PENDIENTE'`.
- **Índice Compuesto en Cartolas:**
  - `idx_transacciones_cuenta_fecha ON transacciones(id_cuenta, fecha_transaccion DESC)` para eliminación de ordenamiento en memoria.

---

## 7. Reglas de Negocio Financieras y Políticas de Seguridad

1. **Fórmula de Amortización Francesa (10.00% Anual):**
   $$\text{Cuota} = \frac{P \times i}{1 - (1 + i)^{-n}}$$
   Donde $i = \frac{0.10}{12} = 0.008333333333$, $P$ es el capital y $n$ el plazo en meses.
2. **Límite Estatutario de Créditos Simultáneos:** Máximo **2 créditos activos** por asociado.
3. **Mayoría de Edad Legal Estricta (18+ Años):** Verificación obligatoria para la afiliación de asociados y para la creación de colaboradores institucionales.
4. **Regla del 100.00% en Beneficiarios:** La suma de porcentajes asignados debe ser exactamente **100.00%**.
5. **Monto Mínimo de Aporte Inicial:** Mínimo **Q100.00** para cualquier apertura de membresía.
6. **Cero Exposición de Contraseñas:** Las contraseñas temporales nunca se muestran en pantalla ni viajan en las respuestas de la API; se envían exclusivamente por correo electrónico vía Google Mail. Sin correo funcionando no se reinician contraseñas.
7. **Cambio Forzoso de Clave en Primer Ingreso:** Las contraseñas temporales expiran inmediatamente tras el primer inicio, forzando al usuario a definir una clave nueva y redirigiéndolo a `/login`.
8. **Protección Anti-Fuerza Bruta:** 3 intentos fallidos bloquean la cuenta por 15 minutos. Todos los fallos responden igual; el `HTTP 423 Locked` solo aparece con la contraseña correcta.
9. **Control de Sesión Única Concurrente:** Bloqueo de sesiones simultáneas (`HTTP 409 Conflict`) con alerta WebSocket en la sesión activa.
10. **Temporizador de Inactividad de 10 Minutos:** Logout automático por inactividad física.
11. **Muerte de Sesión al Retroceder a `/login`:** Destrucción instantánea de tokens al pulsar "Atrás" hacia el login.
12. **Autenticación Inter-Servicio Core Bancario (Zero-Trust):** Cabecera obligatoria `x-banco-api-key` entre backend y Core Banking. La clave no tiene valor por defecto: sin ella, Docker Compose y los servidores no arrancan. El Core Banking solo se publica en `127.0.0.1`.
13. **RBAC en Expedientes (`/api/uploads`):** Descarga protegida con validación estricta de titularidad o rol de auditoría.
14. **Auditoría Forense con IP y User-Agent:** Trazabilidad inmutable en `historial_estados_usuario`.
15. **Política de Contraseñas Elegidas:** Mínimo 8 caracteres, con letras, números y al menos un símbolo (afiliación en línea y cambio de contraseña).
16. **Respuestas que no Revelan Cuentas:** El inicio de sesión, la Banca en Línea y la consulta pública del DPI responden igual exista o no la cuenta y sin datos personales. `verificar-email` solo la usa el personal con sesión.
17. **Límites por Conexión:** 15 inicios de sesión, 30 consultas de DPI o Banca en Línea y 10 códigos de verificación cada 15 minutos.
18. **Afiliación en Línea Verificada:** Comprobante firmado de la Banca en Línea, cuenta de débito del propio titular y correo confirmado con código antes de debitar o crear el caso.
19. **Operaciones con el Banco desde Ventanilla:** Requieren sesión de operador; las aperturas con fondos del banco solo aceptan cuentas del propio asociado y se cancelan si el débito falla.

---

## 8. Esquema de Identidad, Nomenclatura y Gestión Segura de Credenciales

En cumplimiento de las normas de seguridad de la información y privacidad de datos, el sistema no almacena ni expone listados estáticos de contraseñas de usuarios. La gobernanza de identidades opera bajo las siguientes políticas:

### 8.1 Taxonomía de Códigos Corporativos Institucionales

El sistema genera prefijos automáticos según el rol y la vinculación corporativa del usuario:

| Prefijo | Rol Institucional | Descripción y Alcance | Mecanismo de Asignación |
|:---:|:---|:---|:---|
| **`AD-X`** | `ADMINISTRADOR` | Administrador de Plataforma y Centro de Mando | Correlativo asignado al crear el perfil administrativo |
| **`OP-X`** | `OPERADOR` | Operador de Ventanilla, Padrón y Afiliaciones | Correlativo automático `OP-1`, `OP-2`, etc. |
| **`EJ-X`** | `EJECUTIVO` | Ejecutivo de Crédito, Scoring y Resoluciones | Correlativo automático `EJ-1`, `EJ-2`, etc. |
| **`EB-X`** | `ASOCIADO` | Asociado Empleado / Colaborador de la Corporación | Derivado de clientes con nómina bancaria |
| **`EX-X`** | `ASOCIADO` | Asociado Externo / Persona Particular | Generado al formalizar afiliación presencial o digital |

### 8.2 Ciclo de Vida y Generación de Credenciales

1. **Generación Criptográfica:**
   - Toda cuenta nueva creada por el personal (asociado en ventanilla o colaborador institucional) recibe una contraseña temporal generada aleatoriamente mediante funciones criptográficas seguras (`crypto.randomInt`). En la afiliación en línea, el solicitante elige su contraseña y no recibe una temporal.
   - El hash de almacenamiento se procesa con `bcryptjs` utilizando **10 rondas de salteo**.
2. **Despacho Confidencial por Correo:**
   - La credencial generada se despacha directamente a la casilla de correo electrónico registrada del titular a través del servicio institucional de Google Mail.
   - En ningún momento la contraseña temporal se muestra en la pantalla del operador ni del administrador, ni viaja en la respuesta de la API. Se envía después de guardar el registro, y si no sale se informa en pantalla.
3. **Primer Acceso y Cambio Obligatorio:**
   - En el primer inicio de sesión, el sistema intercepta las credenciales temporales mediante la bandera `debe_cambiar_password = true`.
   - Se solicita al usuario ingresar su clave temporal actual y definir una contraseña definitiva personal.
   - Tras la actualización exitosa, el sistema destruye el token temporal y redirige al usuario a la pantalla de `/login` para que ingrese formalmente con su nueva contraseña establecida.
4. **Reinicio Administrativo de Contraseña:**
   - Si un colaborador o asociado olvida su clave, el Administrador ejecuta la acción de reinicio con motivo justificado.
   - El sistema regenera una nueva clave temporal, la persiste con hash seguro y la envía al correo del usuario, manteniéndose oculta para el Administrador. Si el correo no funciona, el reinicio no se aplica.

---

## 9. Guía de Despliegue con Docker Compose

El despliegue del ecosistema completo se efectúa mediante Docker Compose, garantizando aislamiento total y paridad idéntica entre entornos de desarrollo, pruebas y producción.

### 9.1 Prerrequisitos
- Docker Engine (versión 24.0 o superior).
- Docker Compose (v2.20 o superior).

### 9.2 Comandos de Ejecución

0. **Crear el archivo de configuración:** Docker Compose lee `.env` de la raíz automáticamente (sin `--env-file`).
   ```bash
   cp .env.example .env
   openssl rand -hex 32   # una vez por cada clave obligatoria: DB_PASSWORD, JWT_SECRET, BANCO_INTERNAL_API_KEY
   ```
1. **Construir y Levantar los 4 Contenedores en Segundo Plano:**
   ```bash
   docker compose up --build -d
   ```
2. **Verificar el Estado de Salud (*Healthchecks*):**
   ```bash
   docker compose ps
   ```
   *Debe confirmar los 4 contenedores en estado `Up (healthy)`.*
3. **Inspeccionar Logs de los Servicios:**
   ```bash
   docker compose logs -f backend
   ```
4. **Sincronización Rápida del Frontend (en Desarrollo):**
   ```bash
   npm run build --prefix frontend
   docker cp frontend/dist/. cooperativa-frontend:/usr/share/nginx/html/
   ```
5. **Detener y Limpiar Contenedores:**
   ```bash
   docker compose down
   ```

### 9.3 Configuración de Secretos y Variables de Entorno

Todas se definen en `.env` (copia de `.env.example`). Las marcadas como obligatorias no tienen valor por defecto: si faltan, Docker Compose se detiene e indica cuál.

| Variable | Servicio(s) | Propósito de Seguridad y Configuración |
|:---|:---|:---|
| `DB_NAME` / `DB_USER` | `db`, `backend`, `banco-backend` | Base principal (`cooperativa_db`) y usuario de PostgreSQL. |
| `DB_PASSWORD` (**obligatoria**) | `db`, `backend`, `banco-backend` | Contraseña de PostgreSQL. Se usa al crear el volumen; cambiarla después exige recrearlo. |
| `JWT_SECRET` (**obligatoria**) | `backend` | Clave para firmar los tokens JWT (HS256) y, derivada, los comprobantes de la afiliación en línea y los códigos de verificación. |
| `JWT_EXPIRES_IN` | `backend` | Ventana máxima de validez del token de acceso (`8h`). |
| `BANCO_INTERNAL_API_KEY` (**obligatoria**) | `backend`, `banco-backend` | Clave secreta de la cabecera `x-banco-api-key` (Zero-Trust). |
| `MAIL_ENABLED` | `backend` | `false` apaga todo envío de correo. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `EMAIL_FROM` | `backend` | Cuenta de Google Mail emisora, su contraseña de aplicación y el remitente. |
| `FRONTEND_URL` | `backend` | Origen de CORS permitido y enlace para WebSockets Socket.io. |
| `DB_PORT` / `BACKEND_PORT` / `FRONTEND_PORT` | — | Puertos en esta máquina (5432, 5001, 3000). |

Fuera de Docker, `backend/.env` y `banco-backend/.env` deben tener la misma `BANCO_INTERNAL_API_KEY`. En `backend/.env` existe además `CODIGO_VERIFICACION_DEV`: un código fijo para pruebas sin Gmail que se ignora con `NODE_ENV=production`.

### 9.4 Volúmenes Persistentes y Almacenamiento Seguro de Archivos

1. **`cooperativa_db_data` (Volumen Administrado por Docker):**
   - Mapeo en contenedor: `/var/lib/postgresql/data`.
   - Garantiza la persistencia permanente de todos los esquemas, tablas, transacciones contables y secuencias atómicas.
2. **`./backend/uploads` (Bind Mount del Sistema Anfitrión):**
   - Subcarpetas: `/app/uploads/afiliaciones/` y `/app/uploads/creditos/`.
   - Custodia RBAC: Entrega restringida mediante `GET /api/uploads/:subfolder/:filename`.

### 9.5 Verificación de Conectividad y Endpoints de Salud

- **Core Banking Healthcheck:** `GET http://localhost:5002/api/banco/health` (status 200; solo desde esta máquina).
- **Cooperativa Backend Healthcheck:** `GET http://localhost:5001/api/health` (Público, status 200).

---

## 10. Suites de Pruebas Automatizadas (100% Cobertura)

El proyecto cuenta con suites de pruebas automatizadas oficiales en la carpeta `backend/`:

1. **Integridad de Base de Datos (`testDatabaseIntegrity.js`):** Valida parámetros de pool de conexiones, migraciones DDL idempotentes y 10 índices de cobertura B-Tree en llaves foráneas.
2. **Arquitectura y Resiliencia (`testArchitectureImprovements.js`):** Valida timeout defensivo hacia Core Banking (:5002) y persistencia en `./backend/uploads`.
3. **Bandeja Operativa y Bloqueo Concurrente (`testBandejaAfiliaciones.js`):** Valida el bloqueo atómico con `HTTP 409 Conflict`, liberación de casos y formalización presencial.
4. **Traslados de Nómina y Consistencia ACID (`testTraslados.js`):** Valida correlativo `CASO-YYYY-XXXX`, autorización en ventanilla y doble partida contable en el libro mayor.
5. **Verificación Integral de Módulo 1 (`testModulo1Completo.js`):** Valida consulta por DPI sin datos personales, Escenario 1 (comprobante de Banca en Línea, titularidad de la cuenta, personal rechazado), Escenario 2 (mayoría de edad 18+), código de verificación del correo (cifrado, reenvío, 5 intentos, vencimiento), rutas del banco con sesión, Formularios 1, 2 y 3 (beneficiarios 100%), avisos de correo no enviado y Expediente 360°.
6. **Certificación de Ciberseguridad y Zero-Trust (`testCybersecurity.js`):** Valida los 11 hallazgos de seguridad (API Key, RBAC en uploads, prevención DDL Injection, revocación de tokens y auditoría forense con IP/User-Agent).
7. **Flujo de Cambio Forzoso de Contraseña (`testForcedPasswordChange.js`):** Valida que las contraseñas temporales exijan cambio de clave en el primer acceso y que la respuesta de creación no incluya la contraseña ni el secreto 2FA. Usa el backend levantado (puerto 5001) con `MAIL_ENABLED=false`.
8. **Servicio de Mensajería Google (`testGoogleMailer.js`):** Valida conexión y autenticación SMTP con los servidores de Google.
9. **Protocolos de Sesión (`testSecurityProtocols.js`):** Valida el bloqueo por 3 intentos, que una cuenta inexistente responda igual que una existente, el desbloqueo administrativo y la sesión única concurrente.
10. **Doble Factor (`test2faFlow.js`):** Valida activación, inicio de sesión con código y desactivación del 2FA. Usa el backend levantado (puerto 5001).

### Ejecución de Todas las Suites en un Solo Comando:
```bash
node backend/testCybersecurity.js && \
node backend/testDatabaseIntegrity.js && \
node backend/testArchitectureImprovements.js && \
node backend/testBandejaAfiliaciones.js && \
node backend/testTraslados.js && \
node backend/testModulo1Completo.js
```

---

> **Proyecto:** Cooperativa de Ahorro y Crédito - Sistema de Gestión Integral  
> **Ciclo:** Ciclo 10 - Proyecto de Graduación 2 (UMG)  
> **Año:** 2026  
