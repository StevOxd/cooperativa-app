---
trigger: always_on
description: Reglas maestras de arquitectura, RBAC, ciberseguridad y negocio de la Cooperativa. Siempre activas en este repositorio.
---

# Reglas de Arquitectura, Seguridad y Gobernanza del Proyecto

Documento maestro de reglas técnicas, directrices de desarrollo, arquitectura de microservicios y protocolos de ciberseguridad para el ecosistema de la Cooperativa de Ahorro y Crédito.

---

## 1. Ecosistema Tecnológico y Microservicios (Docker)

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide React, Socket.io Client, jsPDF & jsPDF-AutoTable.
- **Backend Principal (Cooperativa):** Node.js 20 LTS, Express.js, Socket.io, Nodemailer (Google Mail SMTP), JWT, bcryptjs, Speakeasy (RFC 6238 TOTP).
- **Core Banking (Simulador Desacoplado):** Node.js 20 LTS, Express.js (Microservicio en puerto 5002, publicado solo en `127.0.0.1`, con base de datos independiente `banco_db`).
- **Configuración:** Un único `.env` en la raíz (copia de `.env.example`) que Docker Compose lee solo. `DB_ADMIN_PASSWORD`, `DB_OWNER_PASSWORD`, `DB_PASSWORD`, `JWT_SECRET` y `BANCO_INTERNAL_API_KEY` no tienen valor por defecto en el código ni en `docker-compose.yml`.
- **Roles de la base de datos (mínimo privilegio):** El backend y el banco trabajan con `DB_USER` (sin DDL, sin tablas temporales, sin `setval`, sin superusuario). Las migraciones usan `DB_OWNER_USER`, dueño de las tablas, y al terminar fijan los permisos de la aplicación: lee, agrega y modifica en todas las tablas, salvo los registros de solo agregar (`TABLAS_SOLO_INSERCION` en `migrations.js`; en el banco, `movimientos_bancarios`), y borra solo en `TABLAS_CON_BORRADO`. Una tabla nueva que necesite borrar o que sea de solo agregar se agrega a esa lista. El superusuario (`DB_ADMIN_USER`) solo lo usan el contenedor `db` y el servicio `db-roles` (`backend/database-roles.sql`), que prepara los roles en cada arranque. Las purgas de prueba de registros inmutables exigen el rol dueño (`poolDueno` en `testHelper.js`), y los triggers de auditoría usan `pg_catalog` con `search_path` fijo.
- **Base de Datos:** PostgreSQL 16 Alpine con esquemas normalizados en Tercera Forma Normal (3FN), secuencias atómicas y cobertura de índices B-Tree en llaves foráneas.
- **Servidor Web y Proxy Inverso:** Nginx 1.27 Alpine (puerto 3000 hacia el host).
- **Producción:** Un servidor propio en la red local, que solo actualiza el workflow `Despliegue` (`.github/workflows/deploy.yml`) después del CI en verde de `main` y la aprobación del ambiente `production`, en un runner propio con la etiqueta `produccion`. Un gancho de root rechaza en ese runner todo trabajo que no sea `deploy.yml` de `main`. Ahí `docker-compose.produccion.yml` publica solo el portal y solo en la IP de la red local (la base, el banco y el backend no publican puertos), y los archivos subidos viven en `UPLOADS_DIR`, fuera del código. En el servidor no se edita código. Un cambio de esquema o de permisos no se revierte solo. Los registros de Actions son públicos: ningún paso imprime el `.env`, la salida de `docker compose config` ni registros de contenedores.

---

## 2. Modelo de Control de Acceso (RBAC) y Roles

> **POLÍTICA ESTRICTA: Cero SUPERADMIN.**  
> El rol SUPERADMIN está terminantemente prohibido y eliminado del código y base de datos. La máxima autoridad recae sobre el rol ADMINISTRADOR.

1. **ADMINISTRADOR (`AD-X`):** Gobernanza de colaboradores, centro de mando con KPIs en vivo, monitor de presencia por WebSockets, desbloqueo en 1 clic de cuentas bloqueadas por fuerza bruta y auditoría forense inmutable.
2. **OPERADOR (`OP-X`):** Atención de ventanilla en agencia, bloqueo concurrente (HTTP 409), formalización en Formulario 1 con detección automática de DPI (EB vs EX), apertura de cuentas adicionales (Formulario 2), beneficiarios con regla estricta del 100% (Formulario 3), expedientes 360°, y triaje de crédito con obligatoriedad de PDF firmado.
3. **EJECUTIVO (`EJ-X`):** Evaluación colegiada del Comité de Crédito, motor de scoring crediticio, análisis de flujo financiero (CRÉDITO vs DÉBITO), verificación de contrato PDF firmado manuscrito y resolución resolutiva (Aprobar con desembolso, Devolver con comentarios o Denegar). Solo el EJECUTIVO aprueba y desembolsa, y solo lo que elevó un operador distinto de quien aprueba (HTTP 403 `APROBACION_POR_QUIEN_ELEVO`).
4. **ASOCIADO (`EB-X` / `EX-X`):** Cada usuario tiene un solo rol, pero una persona puede tener un usuario del personal y uno de asociado (`usuarios.id_usuario` es la llave; issue #32). El personal se afilia por cualquier canal con un usuario de asociado aparte y un correo distinto, y nadie atiende sus propios trámites (`middlewares/segregacion.js`, HTTP 403 `AUTOATENCION_NO_PERMITIDA`). Portal financiero de autogestión, consulta de balances consolidados (Total Cooperativa vs Saldo Banco Externo), traslados de nómina con correlativo `CASO-YYYY-XXXX` desde la cuenta que elija (planilla o cualquiera de sus cuentas activas del banco), simulador de crédito con amortización francesa y descarga de estados de cuenta oficiales en PDF.

---

## 3. Protocolos de Ciberseguridad Bancaria

1. **Cero Exposición de Contraseñas:** Las contraseñas temporales generadas criptográficamente (`crypto.randomInt`) nunca se muestran en pantalla al operador ni al administrador ni viajan en las respuestas de la API; se envían exclusivamente por correo electrónico vía Google Mail SMTP, después de guardar el registro. Si el correo no sale, se informa (`correo_enviado`), y sin correo funcionando no se reinician contraseñas.
2. **Cambio Forzoso de Contraseña en Primer Ingreso:** La bandera `debe_cambiar_password = true` intercepta la sesión y obliga al usuario a definir su contraseña definitiva en su primer ingreso, destruyendo la sesión temporal y redirigiéndolo a `/login`.
3. **Autenticación de Doble Factor (2FA TOTP RFC 6238):** Activación voluntaria y autogestionada desde «Seguridad» mediante Google Authenticator o Microsoft Authenticator. El secreto solo se genera al activarlo; ningún flujo de alta lo genera, lo devuelve ni lo muestra.
4. **Protección Anti-Fuerza Bruta:** Tras 3 intentos fallidos consecutivos, la cuenta se congela automáticamente por 15 minutos, permitiendo su reactivación administrativa inmediata. Todos los fallos responden con el mismo mensaje; el HTTP 423 Locked solo se muestra con la contraseña correcta.
5. **Control de Sesión Única Concurrente:** Bloqueo de sesiones simultáneas (HTTP 409 Conflict) con notificación en tiempo real vía WebSockets en el dispositivo activo original. Las rutas y los WebSockets solo aceptan el token de la sesión vigente del usuario (`services/sesionService.js`); los tokens de un paso concreto, como el del 2FA, no son sesión.
6. **Temporizador de Inactividad de 10 Minutos:** Logout automático sincronizado entre pestañas del navegador tras 10 minutos de inactividad física.
7. **Arquitectura Zero-Trust Inter-Servicio:** Cabecera secreta `x-banco-api-key` obligatoria para cualquier interacción entre el Backend de la Cooperativa y el Core Banking. Sin la variable, los servidores no arrancan. Las rutas de la cooperativa que operan con el banco (`/api/banco-externo`) exigen sesión de operador.
8. **RBAC en Archivos y Documentos:** Erradicación de `express.static`. La descarga de comprobantes y solicitudes firmadas se realiza mediante `/api/uploads/:subfolder/:filename` validando titularidad y roles. Todo documento solo acepta el token en la cabecera (nunca en la URL; el frontend lo pide como blob), se busca primero en la base (sin registro no se mira el disco), lo abre el personal o su dueño y se entrega sin caché; a quien no puede verlo se le responde igual que si no existiera. Los archivos se nombran con un UUID. Cada apertura de un documento de afiliación (`afiliaciones`) queda en `accesos_documento`. Se validan por contenido (firma de PDF, JPG o PNG, hasta 5 MB) y el servidor les pone el nombre.
9. **Auditoría Forense Inmutable:** Todo cambio de estado de usuario se registra en `historial_estados_usuario` con dirección IP de origen, cabecera User-Agent y motivo justificado.
10. **Política de Contraseñas:** Las contraseñas elegidas por el usuario tienen mínimo 8 caracteres, con letras, números y al menos un símbolo (`utils/passwordPolicy.js` en backend y frontend).
11. **Respuestas que no Revelan Cuentas:** Login, Banca en Línea y consulta pública del DPI responden igual exista o no la cuenta, sin datos personales y con un tiempo equivalente. Las consultas de disponibilidad (`verificar-email`) son solo para el personal.
12. **Límites por Conexión (`express-rate-limit`):** 15 inicios de sesión, 30 consultas de DPI o Banca en Línea, 10 códigos de verificación de correo y 20 depósitos o aperturas en el banco desde ventanilla cada 15 minutos. Por usuario: 20 cargas de documentos de afiliación del asociado y 30 reportes del personal cada 15 minutos.
13. **Titularidad y Resultados de Operaciones Bancarias:** Todo débito lleva el DPI del titular (el banco rechaza cuentas de otra persona) y se revisa el resultado de `bancoApiService` (devuelve `success: false`, no lanza errores) antes de registrar el movimiento.
14. **Sin Secretos en Registros ni Respuestas:** Contraseñas, códigos de verificación y secretos 2FA no se escriben en consola ni viajan en respuestas JSON.
15. **Reportes de Gestión Registrados:** Los datos de cada reporte del personal los arma el servidor (`/api/reportes/:tipo`) según el rol que declara el reporte (`services/reportesService.js`); el operador solo saca su propio cierre de caja. Antes de entregarlo queda en `reportes_generados` (de solo agregar) con quién, cuál, formato, filtros, filas e IP, y su folio `REP-XXXXXX` va en el archivo. El período es de un año como máximo y un reporte de más de 10,000 filas no se entrega cortado (HTTP 422). El CSV neutraliza las celdas que Excel tomaría como fórmula.

---

## 4. Reglas Financieras y de Operación de Negocio

1. **Fórmula de Amortización Francesa (10.00% Anual):** Cuota constante nivelada para préstamos personales, calculada matemáticamente sin desviaciones.
2. **Límite Estatutario de Créditos:** Máximo 2 créditos activos simultáneos por asociado.
3. **Mayoría de Edad Legal Estricta (18+ Años):** Verificación obligatoria de mayoría de edad en afiliación presencial, afiliación digital y creación de colaboradores institucionales.
4. **Regla del 100.00% en Beneficiarios:** La suma de porcentajes asignados a beneficiarios debe totalizar exactamente 100.00%.
5. **Monto Mínimo de Apertura:** Mínimo Q100.00 en efectivo en ventanilla para aportaciones iniciales de membresía.
6. **Detección Automática por DPI:** En ventanilla (Formulario 1), el sistema inspecciona el DPI contra el Core Banking y determina de forma autónoma si es Empleado Bancario (`EB-X`) o Cliente Externo (`EX-X`), suprimiendo selectores manuales.
7. **Borrado Lógico Obligatorio:** Queda prohibido el `DELETE` físico de usuarios, asociados o cuentas; toda desvinculación se realiza mediante actualización de `estado` a `'INACTIVO'` con registro auditado.
8. **Afiliación en Línea Verificada:** Requiere el comprobante firmado de la Banca en Línea (15 minutos, solo para ese DPI y sus cuentas), una cuenta de débito del propio titular y el correo confirmado con un código de 6 dígitos (hash, 10 minutos, 5 intentos) antes de debitar o crear el caso.
9. **Efectivo en Ventanilla:** Todo el efectivo que recibe la ventanilla (aportación al afiliar, formalización de agencia, apertura de cuentas y depósito a la cuenta del banco de un colaborador) queda registrado (`efectivo_ventanilla` y `depositos_ventanilla_banco`, inmutables) y suma un tope de Q100,000.00 por persona al día; no hay tope por operador. El depósito al banco es solo para un colaborador que se está afiliando, a una cuenta activa suya, y se registra antes de llamar al banco con su estado (ACREDITADO, RECHAZADO o SIN_CONFIRMAR). Desde la cooperativa, las cuentas del banco se abren sin saldo y sin cambiar los datos del cliente.
10. **Conciliación con el Banco:** Débitos, acreditaciones y aperturas con depósito son idempotentes por referencia en el Core Banking (un reintento no mueve el dinero dos veces). Traslado, desembolso y formalización usan una referencia fija por solicitud (`referenciaDeOperacion`); las demás operaciones, una por intento con 48 bits al azar. Si la cooperativa no puede confirmar una operación ya hecha en el banco, `revertirOAnotar` registra la reversión en `reversiones_pendientes`, confirma con otra conexión que la operación no quedó hecha y la revierte con `REV-<referencia>`; nunca se revierte una operación registrada ni un movimiento que el banco no tiene. Un movimiento sin respuesta del banco (504) con referencia por intento queda anotado, y al rechazar, devolver, denegar o cancelar una solicitud se revierte lo que un intento anterior haya dejado en el banco. El administrador concilia depósitos y reversiones desde «Conciliación», nunca los propios.
11. **Documentos de Afiliación:** Obligatorios el DPI (frente y reverso), un recibo de servicios y una foto sosteniendo el DPI; la constancia de ingresos o laboral es opcional. El operador acepta o rechaza cada uno con motivo (el rechazo se avisa por correo), nunca uno suyo ni uno que él mismo subió (HTTP 403 `REVISION_POR_QUIEN_CARGO`). Un reemplazo es una versión nueva y la anterior se conserva. El asociado sube o reemplaza los pendientes o rechazados desde su portal (hasta 8 versiones por tipo); uno aceptado solo se cambia en ventanilla. A los asociados actuales se les avisa lo que falta, sin bloquear el portal.

---

## 5. Subagentes de Verificación Técnica

El ecosistema cuenta con 5 subagentes especializados definidos en `.agent/agents/` con el formato de subagente de Antigravity (frontmatter con `name`, `description`, `model`, `subagent` y `tools`). Tienen el mismo nombre que los revisores genéricos del kit global (`~/.gemini/config/agents/`), así que dentro de este repositorio los reemplazan con la versión bancaria. Son de solo lectura: reportan hallazgos y el agente principal corrige.
- `code-reviewer`: Revisor de calidad, Clean Code, estándares y testing automatizado.
- `db-reviewer`: Administrador de base de datos, normalización 3FN, índices B-Tree e integridad referencial.
- `security-auditor`: Auditor de seguridad bancaria, OWASP, fuerza bruta, concurrencia y RBAC.
- `software-architect`: Arquitecto de software, desacoplamiento de microservicios, capas y Docker Compose.
- `ux-reviewer`: Diseñador de interfaces, sistema de diseño azul corporativo, estética bancaria y accesibilidad (a11y).