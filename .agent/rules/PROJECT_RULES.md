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
- **Configuración:** Un único `.env` en la raíz (copia de `.env.example`) que Docker Compose lee solo. `DB_PASSWORD`, `JWT_SECRET` y `BANCO_INTERNAL_API_KEY` no tienen valor por defecto en el código ni en `docker-compose.yml`.
- **Base de Datos:** PostgreSQL 16 Alpine con esquemas normalizados en Tercera Forma Normal (3FN), secuencias atómicas y cobertura de índices B-Tree en llaves foráneas.
- **Servidor Web y Proxy Inverso:** Nginx 1.27 Alpine (puerto 3000 hacia el host).

---

## 2. Modelo de Control de Acceso (RBAC) y Roles

> **POLÍTICA ESTRICTA: Cero SUPERADMIN.**  
> El rol SUPERADMIN está terminantemente prohibido y eliminado del código y base de datos. La máxima autoridad recae sobre el rol ADMINISTRADOR.

1. **ADMINISTRADOR (`AD-X`):** Gobernanza de colaboradores, centro de mando con KPIs en vivo, monitor de presencia por WebSockets, desbloqueo en 1 clic de cuentas bloqueadas por fuerza bruta y auditoría forense inmutable.
2. **OPERADOR (`OP-X`):** Atención de ventanilla en agencia, bloqueo concurrente (HTTP 409), formalización en Formulario 1 con detección automática de DPI (EB vs EX), apertura de cuentas adicionales (Formulario 2), beneficiarios con regla estricta del 100% (Formulario 3), expedientes 360°, y triaje de crédito con obligatoriedad de PDF firmado.
3. **EJECUTIVO (`EJ-X`):** Evaluación colegiada del Comité de Crédito, motor de scoring crediticio, análisis de flujo financiero (CRÉDITO vs DÉBITO), verificación de contrato PDF firmado manuscrito y resolución resolutiva (Aprobar con desembolso, Devolver con comentarios o Denegar).
4. **ASOCIADO (`EB-X` / `EX-X`):** Un usuario tiene un solo rol, así que el personal no se afilia en línea (issue #32). Portal financiero de autogestión, consulta de balances consolidados (Total Cooperativa vs Saldo Banco Externo), traslados de nómina con correlativo `CASO-YYYY-XXXX`, simulador de crédito con amortización francesa y descarga de estados de cuenta oficiales en PDF.

---

## 3. Protocolos de Ciberseguridad Bancaria

1. **Cero Exposición de Contraseñas:** Las contraseñas temporales generadas criptográficamente (`crypto.randomInt`) nunca se muestran en pantalla al operador ni al administrador ni viajan en las respuestas de la API; se envían exclusivamente por correo electrónico vía Google Mail SMTP, después de guardar el registro. Si el correo no sale, se informa (`correo_enviado`), y sin correo funcionando no se reinician contraseñas.
2. **Cambio Forzoso de Contraseña en Primer Ingreso:** La bandera `debe_cambiar_password = true` intercepta la sesión y obliga al usuario a definir su contraseña definitiva en su primer ingreso, destruyendo la sesión temporal y redirigiéndolo a `/login`.
3. **Autenticación de Doble Factor (2FA TOTP RFC 6238):** Activación voluntaria y autogestionada desde «Seguridad» mediante Google Authenticator o Microsoft Authenticator. El secreto solo se genera al activarlo; ningún flujo de alta lo genera, lo devuelve ni lo muestra.
4. **Protección Anti-Fuerza Bruta:** Tras 3 intentos fallidos consecutivos, la cuenta se congela automáticamente por 15 minutos, permitiendo su reactivación administrativa inmediata. Todos los fallos responden con el mismo mensaje; el HTTP 423 Locked solo se muestra con la contraseña correcta.
5. **Control de Sesión Única Concurrente:** Bloqueo de sesiones simultáneas (HTTP 409 Conflict) con notificación en tiempo real vía WebSockets en el dispositivo activo original.
6. **Temporizador de Inactividad de 10 Minutos:** Logout automático sincronizado entre pestañas del navegador tras 10 minutos de inactividad física.
7. **Arquitectura Zero-Trust Inter-Servicio:** Cabecera secreta `x-banco-api-key` obligatoria para cualquier interacción entre el Backend de la Cooperativa y el Core Banking. Sin la variable, los servidores no arrancan. Las rutas de la cooperativa que operan con el banco (`/api/banco-externo`) exigen sesión de operador.
8. **RBAC en Archivos y Documentos:** Erradicación de `express.static`. La descarga de comprobantes y solicitudes firmadas se realiza mediante `/api/uploads/:subfolder/:filename` validando titularidad y roles.
9. **Auditoría Forense Inmutable:** Todo cambio de estado de usuario se registra en `historial_estados_usuario` con dirección IP de origen, cabecera User-Agent y motivo justificado.
10. **Política de Contraseñas:** Las contraseñas elegidas por el usuario tienen mínimo 8 caracteres, con letras, números y al menos un símbolo (`utils/passwordPolicy.js` en backend y frontend).
11. **Respuestas que no Revelan Cuentas:** Login, Banca en Línea y consulta pública del DPI responden igual exista o no la cuenta, sin datos personales y con un tiempo equivalente. Las consultas de disponibilidad (`verificar-email`) son solo para el personal.
12. **Límites por Conexión (`express-rate-limit`):** 15 inicios de sesión, 30 consultas de DPI o Banca en Línea y 10 códigos de verificación de correo cada 15 minutos.
13. **Titularidad y Resultados de Operaciones Bancarias:** Todo débito lleva el DPI del titular (el banco rechaza cuentas de otra persona) y se revisa el resultado de `bancoApiService` (devuelve `success: false`, no lanza errores) antes de registrar el movimiento.
14. **Sin Secretos en Registros ni Respuestas:** Contraseñas, códigos de verificación y secretos 2FA no se escriben en consola ni viajan en respuestas JSON.

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

---

## 5. Subagentes de Verificación Técnica

El ecosistema cuenta con 5 subagentes especializados definidos en `.agent/agents/` con el formato de subagente de Antigravity (frontmatter con `name`, `description`, `model`, `subagent` y `tools`). Tienen el mismo nombre que los revisores genéricos del kit global (`~/.gemini/config/agents/`), así que dentro de este repositorio los reemplazan con la versión bancaria. Son de solo lectura: reportan hallazgos y el agente principal corrige.
- `code-reviewer`: Revisor de calidad, Clean Code, estándares y testing automatizado.
- `db-reviewer`: Administrador de base de datos, normalización 3FN, índices B-Tree e integridad referencial.
- `security-auditor`: Auditor de seguridad bancaria, OWASP, fuerza bruta, concurrencia y RBAC.
- `software-architect`: Arquitecto de software, desacoplamiento de microservicios, capas y Docker Compose.
- `ux-reviewer`: Diseñador de interfaces, sistema de diseño azul corporativo, estética bancaria y accesibilidad (a11y).