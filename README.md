# Sistema de Gestion Integral - Cooperativa de Ahorro y Credito

Plataforma integral bancaria y cooperativa disenada para la gestion financiera, inclusion economica, captacion de aportaciones y democratizacion crediticia. El sistema opera como una entidad filial e integrada dentro de la Corporacion Bancaria, manteniendo comunicacion inter-servicio con el sistema central bancario (Core Banking).

Proyecto desarrollado para el curso de Proyecto de Graduacion 2, Decimo Ciclo, Facultad de Ingenieria en Sistemas de Informacion y Ciencias de la Computacion, Universidad Mariano Galvez de Guatemala.

---

## Tabla de Contenidos

1. Descripcion General y Alcance
2. Arquitectura de Microservicios y Contenedores
3. Pila Tecnologica
4. Modelo de Control de Acceso Basado en Roles (RBAC)
5. Modulos Funcionales del Sistema
6. Protocolos de Ciberseguridad Bancaria
7. Estructura de Base de Datos y Modelo Relacional
8. Requisitos del Sistema
9. Guia de Instalacion y Despliegue con Docker Compose
10. Configuracion de Variables de Entorno
11. Suites de Pruebas Automatizadas
12. Creditos y Datos Academicos

---

## 1. Descripcion General y Alcance

El sistema proporciona una solucion completa para la administracion de socios, cuentas de ahorro, certificados de aportacion y lineas de credito. Integra dos modalidades principales de ingreso para los asociados:
- **Afiliacion Digital de Clientes Bancarios:** Proceso desatendido donde los clientes o colaboradores de la entidad bancaria validan su documento de identificacion (CUI/DPI) contra el Core Banking, se autentican con sus credenciales de banca en linea y realizan el debito inicial automatizado via ACH hacia su cuenta cooperativa.
- **Afiliacion en Ventanilla (No Bancarizados y Presenciales):** Pre-registro digital con calculo automatico de mayoria de edad legal y emision de solicitud institucional con codigo correlativo, completado posteriormente en agencia con deposito en ventanilla y emision de comprobante oficial firmado.

---

## 2. Arquitectura de Microservicios y Contenedores

La solucion esta orquestada mediante contenedores Docker comunicados a traves de una red bridge interna privada (`cooperativa-net`):

```
+-----------------------------------------------------------------------------------+
|                            DOCKER COMPOSE (cooperativa-net)                       |
|                                                                                   |
|  [cooperativa-frontend]       [cooperativa-backend]         [cooperativa-db]      |
|  Nginx 1.27 Alpine            Node.js 20 Alpine             PostgreSQL 16 Alpine  |
|  Puerto Host: 3000            Puerto Host: 5001             Puerto Host: 5432     |
|  (React 18 SPA + Vite)        (API REST + Socket.io + Mail) (cooperativa_db &     |
|        |                               |                     banco_db)            |
|        |                               |                             |            |
|        +------- Proxy HTTP /ws --------+------ Pool TCP (5432) ------+            |
|                                        |                                          |
|                                  HTTP  | (Timeout defensivo 5s)                   |
|                                  REST  v                                          |
|                              [banco-backend]                                      |
|                              Node.js 20 Alpine                                    |
|                              Puerto Host: 5002                                    |
|                              (Simulador Core Banking)                             |
+-----------------------------------------------------------------------------------+
```

### Descripcion de Contenedores

- **cooperativa-frontend (Puerto 3000):** Servidor web de alto rendimiento basado en Nginx que sirve la aplicacion cliente SPA y enruta peticiones hacia la API y WebSockets sin exponer puertos internos.
- **cooperativa-backend (Puerto 5001):** API REST principal construida sobre Express.js. Gestiona autenticacion, logica financiera, despacho de correos SMTP transaccionales y notificaciones en tiempo real con Socket.io.
- **banco-backend (Puerto 5002):** Microservicio desacoplado que simula el Core Banking corporativo, exponiendo endpoints seguros protegidos por API Key inter-servicio para la consulta de clientes, cuentas bancarias y ejecucion de debitos ACH.
- **cooperativa-db (Puerto 5432):** Servidor de base de datos relacional PostgreSQL 16 con esquemas normalizados en Tercera Forma Normal (3FN), secuencias atomicas, triggers de auditoria y volumen persistente administrado.

---

## 3. Pila Tecnologica

### Frontend
- React 18
- Vite
- Tailwind CSS
- Lucide React
- Socket.io Client
- jsPDF & jsPDF-AutoTable (generacion de estados de cuenta y comprobantes)

### Backend
- Node.js 20 LTS
- Express.js
- PostgreSQL (pg client con connection pooling)
- Socket.io (comunicacion bidireccional y monitor en vivo)
- Nodemailer (integracion SMTP con Google Mail)
- JSON Web Tokens (JWT) y bcryptjs (hashing seguro con factor 10)
- Speakeasy & QRCode (implementacion de TOTP RFC 6238)
- Multer (carga segura de archivos)

### Base de Datos e Infraestructura
- PostgreSQL 16
- Docker y Docker Compose
- Nginx 1.27 Alpine

---

## 4. Modelo de Control de Acceso Basado en Roles (RBAC)

El sistema implementa una estricta jerarquia de cuatro roles independientes. Se ha erradicado por completo el rol generico o inseguro SUPERADMIN, concentrando la administracion superior en el perfil formal ADMINISTRADOR.

| Rol | Prefijo de Codigo | Descripcion y Responsabilidades |
|:---|:---:|:---|
| **ADMINISTRADOR** | `AD-X` | Gestion de colaboradores institucionales, desbloqueo administrativo de cuentas, monitoreo de sesiones activas y auditoria forense inmutable. |
| **OPERADOR** | `OP-X` | Atencion en ventanilla, formalizacion de solicitudes de membresia, clasificacion automatica por DPI, apertura de cuentas, asignacion testamentaria y emision de comprobantes oficiales. |
| **EJECUTIVO** | `EJ-X` | Evaluacion del Comite de Credito, analisis de scoring financiero, revision obligatoria de expedientes PDF con firma manuscrita, aprobacion o denegacion de prestamos. |
| **ASOCIADO** | `EB-X` / `EX-X` | Portal de autogestion para socios (`EB` para colaboradores bancarios con nomina y `EX` para clientes particulares externos). Consulta de saldos, traslados, simulador de credito y descarga de estados de cuenta oficiales. |

---

## 5. Modulos Funcionales del Sistema

### 5.1 Modulo de Afiliacion y Formalizacion Presencial
- **Deteccion y Clasificacion Autonoma por DPI:** El sistema inspecciona el CUI/DPI contra el Core Banking y determina automaticamente si corresponde a un Empleado Bancario (`EB`) o Cliente Externo (`EX`), eliminando selectores manuales propensos a inconsistencias.
- **Modalidades de Acreditacion:** Registro de efectivo en ventanilla (`EFECTIVO_VENTANILLA`) con aporte minimo obligatorio de Q100.00. Para externos, se genera de manera sincronizada su cuenta de ahorro bancaria; para empleados, se validan sus cuentas existentes permitiendo acreditacion directa.
- **Selector de Nacimiento Estandarizado:** Componente unificado con selectores de dia, mes y ano con evaluacion dinamica de mayoria de edad (minimo 18 anos cumplidos).
- **Gestion Testamentaria:** Formulario de asignacion de beneficiarios con validacion estricta de suma exactamente igual a 100.00%.

### 5.2 Modulo de Cuentas, Aportaciones y Traslados
- **Cuentas Soportadas:** Cuentas de Aportaciones Obligatorias, Ahorro Corriente y Cuentas de Ahorro para Metas.
- **Doble Partida Contable:** Toda operacion financiera queda asentada en el libro mayor de transacciones con identificador correlativo, saldo anterior, monto y nuevo balance garantizando propiedades ACID.
- **Traslados de Nomina:** Solicitudes de debito desde cuenta bancaria hacia cuentas cooperativas con numero de caso institucional `CASO-YYYY-XXXX`.

### 5.3 Modulo de Creditos y Resolucion Colegiada
- **Simulador de Amortizacion Francesa:** Calculo de cuota nivelada constante bajo una tasa del 10.00% anual con desglose capital/interes.
- **Tope Estatutario:** Maximo estricto de dos creditos activos simultaneos por asociado.
- **Obligatoriedad de Documento Firmado:** El Operador no puede elevar y el Ejecutivo no puede resolver favorablemente una solicitud sin la presencia verificada del contrato PDF con firma manuscrita.
- **Motor de Scoring Financiero:** Evaluacion de capacidad de pago basada en el balance de ingresos (credito) frente a egresos (debito).

### 5.4 Modulo de Centro de Mando y Auditoria Forense
- **Indicadores en Tiempo Real:** Tarjetas de rendimiento operativo, metricas de seguridad, distribucion de roles y altas semestrales.
- **Monitor de Presencia:** Deteccion de conexiones concurrentes y latidos en vivo mediante WebSockets.
- **Registro Inmutable:** Tabla `historial_estados_usuario` que registra cada cambio de estado, motivo justificado, identificador del operador, direccion IP de origen y cabecera User-Agent.

---

## 6. Protocolos de Ciberseguridad Bancaria

1. **Cero Exposicion de Contrasenas:** Las contrasenas temporales generadas criptograficamente nunca se muestran en pantalla ni se imprimen; se transmiten directamente al correo electronico registrado del usuario via Google Mail SMTP.
2. **Cambio Forzoso en Primer Ingreso:** Las contrasenas temporales poseen el atributo `primer_ingreso = true`, obligando al usuario a establecer una nueva contrasena personal en su acceso inicial antes de poder navegar.
3. **Autenticacion de Doble Factor (2FA TOTP RFC 6238):** Activacion voluntaria desde el panel de seguridad de usuario compatible con Google Authenticator y Microsoft Authenticator.
4. **Proteccion Anti-Fuerza Bruta:** Contador maximo de 3 intentos fallidos consecutivos que activa un bloqueo temporal por 15 minutos (codigo HTTP 423 Locked). Permite reactivacion inmediata por el Administrador.
5. **Control de Sesion Unica Concurrente:** Bloqueo de sesiones simultaneas con advertencia en tiempo real en la sesion original mediante Socket.io.
6. **Temporizador de Inactividad de 10 Minutos:** Desconexion automatica por inactividad fisica con cierre de sesion sincronizado en el navegador.
7. **Arquitectura Zero-Trust Inter-Servicio:** Validacion obligatoria de cabecera secreta `x-banco-api-key` en todas las comunicaciones entre backend y Core Banking.
8. **Acceso RBAC a Documentos:** La descarga de comprobantes y contratos escaneados no se realiza por directorio estatico publico, sino a traves de la ruta protegida `/api/uploads/*` validando titularidad y roles autorizados.

---

## 7. Estructura de Base de Datos y Modelo Relacional

El motor PostgreSQL aloja de manera aislada dos bases de datos:
- `cooperativa_db`: Esquema institucional de la cooperativa conformado por 14 tablas en Tercera Forma Normal (3FN), que incluyen `personas`, `usuarios`, `roles`, `asociados`, `tipos_cuenta`, `cuentas`, `beneficiarios`, `solicitudes_afiliacion_agencia`, `solicitudes_traslado_apertura`, `solicitudes_credito`, `transacciones` e `historial_estados_usuario`.
- `banco_db`: Esquema del Core Banking corporativo con tablas para `clientes_banco`, `cuentas_bancarias`, `usuarios_banca_en_linea` y `movimientos_bancarios`.

La base de datos cuenta con indices optimizados B-Tree sobre todas las llaves foraneas e indices parciales para consultas de alto rendimiento en bandejas de solicitudes pendientes.

---

## 8. Requisitos del Sistema

- **Sistema Operativo:** Linux (Ubuntu 22.04 LTS o superior recomendado), macOS (con Docker Desktop) o Windows 11 (con WSL 2 y Docker Desktop).
- **Motor de Contenedores:** Docker Engine 24.0+ y Docker Compose v2.20+.
- **Memoria RAM:** Minimo 4 GB (8 GB recomendado para entorno completo de desarrollo).
- **Espacio en Disco:** Minimo 5 GB libres.

---

## 9. Guia de Instalacion y Despliegue con Docker Compose

### 9.1 Clonacion del Repositorio
```bash
git clone https://github.com/StevOxd/cooperativa-app.git
cd cooperativa-app
```

### 9.2 Configuracion del Archivo de Entorno
Copie la plantilla de variables de entorno y ajuste las credenciales segun corresponda:
```bash
cp docker.env.example docker.env
```

### 9.3 Despliegue de los Servicios
Construya y ejecute los 4 contenedores en segundo plano:
```bash
docker compose up --build -d
```

### 9.4 Verificacion del Estado de los Contenedores
Confirme que todos los servicios se encuentren en estado de salud correcto:
```bash
docker compose ps
```

Puntos de acceso en el entorno local:
- Portal Web (Frontend): http://localhost:3000
- API Cooperativa Backend: http://localhost:5001/api/health
- API Core Banking: http://localhost:5002/api/banco/health

### 9.5 Detencion de los Servicios
Para detener los contenedores preservando los datos:
```bash
docker compose down
```

---

## 10. Configuracion de Variables de Entorno

El archivo `docker.env` centraliza los parametros de configuracion para los contenedores:

| Variable | Descripcion | Valor Predeterminado / Ejemplo |
|:---|:---|:---|
| `POSTGRES_DB` | Nombre de la base de datos principal | `cooperativa_db` |
| `POSTGRES_USER` | Usuario de conexion PostgreSQL | `postgres` |
| `POSTGRES_PASSWORD` | Contrasena segura de base de datos | *(Definir valor seguro)* |
| `JWT_SECRET` | Clave secreta para firma de tokens JWT | *(Cadena criptografica segura)* |
| `JWT_EXPIRES_IN` | Tiempo de vida del token de acceso | `8h` |
| `BANCO_API_URL` | URL de comunicacion interna con Core Banking | `http://banco-backend:5002` |
| `BANCO_INTERNAL_API_KEY` | Token secreto de cabecera inter-servicio | *(Clave alfanumerica segura)* |
| `GOOGLE_EMAIL_USER` | Cuenta de correo para notificaciones SMTP | `notificaciones@cooperativa.edu.gt` |
| `GOOGLE_EMAIL_APP_PASSWORD` | Contrasena de aplicacion de Google | *(Contrasena de 16 caracteres)* |
| `FRONTEND_URL` | Origen autorizado para CORS y WebSockets | `http://localhost:3000` |

---

## 11. Suites de Pruebas Automatizadas

El proyecto incluye un conjunto completo de scripts de prueba automatizados en la carpeta `backend/` para validar la integridad de la logica de negocio, persistencia relacional y politicas de seguridad:

| Archivo de Prueba | Cobertura y Proposito |
|:---|:---|
| `testCybersecurity.js` | Validacion de los protocolos de ciberseguridad, RBAC en descargas y proteccion de API Key. |
| `testDatabaseIntegrity.js` | Verificacion de migraciones DDL idempotentes, esquemas relacionales y 10 indices B-Tree. |
| `testArchitectureImprovements.js` | Comprobacion de resiliencia, timeouts defensivos y persistencia en volumen de uploads. |
| `testBandejaAfiliaciones.js` | Evaluacion de bloqueos concurrentes (HTTP 409) y formalizacion en ventanilla. |
| `testTraslados.js` | Prueba transaccional de traslados con doble partida y consistencia contable ACID. |
| `testModulo1Completo.js` | Verificacion integral de flujos de afiliacion digital y formalizacion en agencia. |
| `testForcedPasswordChange.js` | Validacion del ciclo de cambio de contrasena en primer ingreso y cierre de sesion. |
| `testGoogleMailer.js` | Prueba de conectividad y autenticacion con el servicio SMTP de Google. |

### Ejecucion de Pruebas:
```bash
node backend/testCybersecurity.js && \
node backend/testDatabaseIntegrity.js && \
node backend/testArchitectureImprovements.js && \
node backend/testBandejaAfiliaciones.js && \
node backend/testTraslados.js && \
node backend/testModulo1Completo.js
```

---

## 12. Creditos y Datos Academicos

- **Institucion:** Universidad Mariano Galvez de Guatemala
- **Facultad:** Ingenieria en Sistemas de Informacion y Ciencias de la Computacion
- **Curso:** Proyecto de Graduacion 2 (Decimo Ciclo)
- **Ano Academico:** 2026
