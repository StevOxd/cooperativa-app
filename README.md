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
- **db-roles (sin puerto):** Se ejecuta una vez en cada arranque, con el superusuario, y termina: prepara el rol dueño de las tablas y el rol de la aplicacion antes de que arranquen el backend y el banco.

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

### 5.5 Modulo de Reportes de Gestion
- **Pantalla «Reportes» del personal:** cierre de caja y padron (operador); cartera de creditos y acta del comite (ejecutivo y administrador); afiliaciones, auditoria de usuarios, efectivo de ventanilla, conciliacion, accesos a documentos y reportes generados (administrador). Cada uno en PDF o CSV para Excel, con el periodo que se elija.
- **Registro con folio:** cada reporte queda en `reportes_generados` y su folio `REP-XXXXXX` va en el archivo.
- **Portal del asociado:** constancia de afiliacion, plan de pagos de cada credito y comprobante de cada traslado en PDF.

---

## 6. Protocolos de Ciberseguridad Bancaria

1. **Cero Exposicion de Contrasenas:** Las contrasenas temporales generadas criptograficamente nunca se muestran en pantalla, no se imprimen ni viajan en las respuestas de la API; se transmiten directamente al correo electronico registrado del usuario via Google Mail SMTP. Si el correo no sale, el sistema lo avisa, y sin correo funcionando no se reinician contrasenas.
2. **Cambio Forzoso en Primer Ingreso:** Las contrasenas temporales poseen el atributo `debe_cambiar_password = true`, obligando al usuario a establecer una nueva contrasena personal (minimo 8 caracteres, con letras, numeros y un simbolo) en su acceso inicial antes de poder navegar.
3. **Autenticacion de Doble Factor (2FA TOTP RFC 6238):** Activacion voluntaria desde el panel de seguridad de usuario compatible con Google Authenticator y Microsoft Authenticator. El secreto solo se genera al activarlo.
4. **Proteccion Anti-Fuerza Bruta:** Contador maximo de 3 intentos fallidos consecutivos que activa un bloqueo temporal por 15 minutos. Todos los fallos responden con el mismo mensaje, exista o no la cuenta; el aviso de cuenta bloqueada (HTTP 423 Locked) solo aparece con la contrasena correcta. Permite reactivacion inmediata por el Administrador.
5. **Control de Sesion Unica Concurrente:** Bloqueo de sesiones simultaneas con advertencia en tiempo real en la sesion original mediante Socket.io.
6. **Temporizador de Inactividad de 10 Minutos:** Desconexion automatica por inactividad fisica con cierre de sesion sincronizado en el navegador.
7. **Arquitectura Zero-Trust Inter-Servicio:** Validacion obligatoria de cabecera secreta `x-banco-api-key` en todas las comunicaciones entre backend y Core Banking. La clave no tiene valor por defecto, y el Core Banking solo se publica en `127.0.0.1`. Las operaciones con el banco desde la ventanilla exigen sesion de operador.
8. **Acceso RBAC a Documentos:** La descarga de comprobantes y contratos escaneados no se realiza por directorio estatico publico, sino a traves de la ruta protegida `/api/uploads/*` validando titularidad y roles autorizados. Los documentos de afiliacion (DPI, recibo, foto con el DPI) se validan por contenido, solo aceptan el token en la cabecera y cada apertura queda registrada.
9. **Afiliacion en Linea Verificada:** Comprobante firmado de la Banca en Linea, debito solo desde una cuenta del propio titular y correo confirmado con un codigo de 6 digitos antes de debitar o crear el caso.
10. **Respuestas que no Revelan Cuentas:** El inicio de sesion, la Banca en Linea y la consulta publica del DPI responden igual exista o no la cuenta y sin datos personales, con limites de intentos por conexion.
11. **Minimo Privilegio en la Base de Datos:** El backend y el banco se conectan con un rol que lee, agrega y modifica datos, pero no es superusuario, no crea tablas, no desactiva triggers, no modifica la auditoria ni los movimientos y solo borra en las pocas tablas que el codigo limpia (lo demas se desvincula por estado). Las migraciones usan un rol dueño aparte y el superusuario solo prepara los roles al arrancar.

---

## 7. Estructura de Base de Datos y Modelo Relacional

El motor PostgreSQL aloja de manera aislada dos bases de datos:
- `cooperativa_db`: Esquema institucional de la cooperativa conformado por 16 tablas en Tercera Forma Normal (3FN), que incluyen `personas`, `usuarios`, `roles`, `asociados`, `tipos_cuenta`, `cuentas`, `beneficiarios`, `solicitudes_afiliacion_agencia`, `solicitudes_traslado_apertura`, `solicitudes_credito`, `transacciones`, `historial_estados_usuario`, `codigos_verificacion_correo` y `depositos_ventanilla_banco`.
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
Copie la plantilla de variables de entorno. Docker Compose lee el archivo `.env` de la raíz automáticamente, sin `--env-file`:
```bash
cp .env.example .env
```

Complete las claves obligatorias (`DB_ADMIN_PASSWORD`, `DB_OWNER_PASSWORD`, `DB_PASSWORD`, `JWT_SECRET` y `BANCO_INTERNAL_API_KEY`) con valores propios. Para generar cada una:
```bash
openssl rand -hex 32
```

Las claves no tienen valor por defecto: si falta alguna, `docker compose` se detiene e indica cuál. `DB_ADMIN_PASSWORD` se usa al crear la base por primera vez; si la cambia después, recree el volumen con `docker compose down -v` (borra los datos). Las otras dos contraseñas de la base se pueden cambiar en cualquier momento: el servicio `db-roles` las aplica en cada arranque.

**Roles de la base de datos.** El backend y el banco no usan el superusuario de PostgreSQL. El servicio `db-roles` se ejecuta una vez en cada arranque, con el superusuario (`DB_ADMIN_USER`), y deja tres roles con lo mínimo que necesita cada uno:

| Rol | Variable | Para qué se usa |
|:---|:---|:---|
| Superusuario | `DB_ADMIN_USER` | Crear el volumen y ejecutar `db-roles`. Nadie más lo usa. |
| Dueño | `DB_OWNER_USER` | Dueño de las bases y las tablas. Solo lo usan las migraciones al arrancar. |
| Aplicación | `DB_USER` | Con el que trabajan el backend y el banco: lee, agrega y modifica datos, pero no crea tablas, no desactiva triggers, no modifica la auditoría ni los movimientos y solo borra en las pocas tablas que el código limpia. Las migraciones fijan estos permisos en cada arranque. |

### 9.3 Despliegue de los Servicios
Construya y ejecute los 4 contenedores en segundo plano (antes corre `db-roles`, que prepara los roles de la base y termina):
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
- API Core Banking: http://localhost:5002/api/banco/health (solo desde esta máquina)

La base de datos (5432) y el Core Banking (5002) se publican solo en `127.0.0.1`: se puede llegar a ellos desde la misma máquina, para las pruebas, pero no desde la red.

### 9.5 Detencion de los Servicios
Para detener los contenedores preservando los datos:
```bash
docker compose down
```

### 9.6 Actualizacion de una Instalacion Anterior a los Roles de Base de Datos
Si su `.env` es anterior a los tres roles (solo tiene `DB_USER` y `DB_PASSWORD`), no hace falta borrar los datos:

1. En `.env`, renombre `DB_USER` a `DB_ADMIN_USER` y `DB_PASSWORD` a `DB_ADMIN_PASSWORD`, sin cambiar sus valores (son los del superusuario que creó el volumen).
2. Agregue `DB_OWNER_USER=cooperativa_owner`, `DB_USER=cooperativa_app` y una contraseña nueva para cada uno en `DB_OWNER_PASSWORD` y `DB_PASSWORD` (`openssl rand -hex 32`).
3. Ejecute `docker compose up -d --build`. El servicio `db-roles` crea los dos roles y les pasa las tablas existentes; los datos no cambian.
4. Si ejecuta el backend, el banco o las pruebas fuera de Docker, copie los mismos valores en `backend/.env` y `banco-backend/.env`.

### 9.7 Despliegue Continuo a Produccion
Producción es un servidor propio en la red local. Nada queda expuesto a internet: el portal solo se abre desde esa red y el servidor solo abre conexiones de salida hacia GitHub.

**Flujo.** Cada cambio entra por un Pull Request. Al fusionarlo en `main`, el workflow `CI` valida el código y, si termina en verde, el workflow `Despliegue` (`.github/workflows/deploy.yml`) espera la aprobación del ambiente `production` y corre en el runner del servidor:

1. Comprueba la carpeta de producción, la versión de Docker Compose y que nadie haya cambiado ni agregado código a mano.
2. Respalda `cooperativa_db`, `banco_db` y los archivos subidos en `/srv/cooperativa/respaldos`. Sin respaldo no se despliega: si la base tiene datos y no está corriendo, se detiene.
3. Pasa al commit exacto que pasó el CI. Nunca hacia atrás: para deshacer un cambio se usa un PR de revert.
4. Valida la configuración sin mostrarla, reconstruye los contenedores y comprueba que solo el portal quedó publicado, y solo en la IP local.
5. Espera a que todo esté sano y prueba el portal y `/api/health` a través de Nginx.
6. Si algo falla, vuelve al commit anterior. Si la versión nueva cambió el esquema o los permisos de la base, no vuelve atrás sola: detiene el portal y el backend y deja la decisión a una persona, con el respaldo a mano.
7. Solo si todo salió bien, borra los respaldos más viejos (conserva 10) y las imágenes sin uso.

En producción, `docker-compose.produccion.yml` se aplica encima del compose base. Publica el portal solo en la IP de la red local, deja la base, el banco y el backend sin puertos publicados (se hablan por la red interna de Docker y Nginx atiende `/api`) y guarda los archivos subidos fuera de la carpeta del código. Docker publica los puertos por encima del firewall del sistema, por eso la dirección se fija en el compose. Requiere Docker Compose 2.24.4 o superior.

**Preparación del servidor (una sola vez).**

1. **Runner de GitHub Actions.** Instálelo desde *Settings*, *Actions*, *Runners*, *New self-hosted runner*, con un usuario propio sin sudo (`github-runner`), solo con la etiqueta `produccion`, y como servicio:
   ```bash
   sudo -u github-runner -H ./config.sh --unattended --url https://github.com/<usuario>/cooperativa-app \
     --token <token> --name <servidor>-produccion --no-default-labels --labels produccion --work _work
   sudo ./svc.sh install github-runner && sudo ./svc.sh start
   ```
   El usuario del runner está en el grupo `docker`, y ese grupo equivale a ser administrador del servidor. Por eso el runner solo debe ejecutar el despliegue.
2. **Gancho que rechaza todo lo demás.** El ambiente `production` solo protege a los trabajos que lo declaran: un PR que modifique cualquier workflow y pida `runs-on: produccion` correría en el servidor si alguien lo aprueba. Un script de root, `/usr/local/sbin/runner-solo-despliegue.sh` (permiso 755), rechaza antes del primer paso todo trabajo cuyo `GITHUB_WORKFLOW_REF` no sea `<usuario>/cooperativa-app/.github/workflows/deploy.yml@refs/heads/main` o cuyo evento no sea `workflow_run` ni `workflow_dispatch`. Se activa en el `.env` del runner y se reinicia el servicio:
   ```bash
   echo ACTIONS_RUNNER_HOOK_JOB_STARTED=/usr/local/sbin/runner-solo-despliegue.sh | sudo -u github-runner tee -a /opt/actions-runner/.env
   sudo systemctl restart actions.runner.<usuario>-cooperativa-app.<servidor>-produccion.service
   ```
   Además, en *Settings*, *Actions*, *General*, elija *Require approval for all external contributors* y revise la carpeta `.github/workflows/` de un PR externo antes de aprobar su ejecución.
3. **Ambiente `production`.** En *Settings*, *Environments*, cree `production` con *Required reviewers* y limite *Deployment branches and tags* a `main`.
4. **Carpetas de datos**, fuera del código. Los archivos subidos pertenecen al uid 1000, que es el usuario `node` del backend, y no los lee ningún otro usuario del servidor:
   ```bash
   sudo install -d -m 755 /srv/cooperativa
   sudo install -d -m 770 -o 1000 -g 1000 /srv/cooperativa/uploads
   sudo install -d -m 700 -o github-runner -g github-runner /srv/cooperativa/respaldos
   ```
5. **Carpeta de producción y su `.env`.** La clona el usuario del runner, que es el único que la modifica:
   ```bash
   sudo install -d -m 750 -o github-runner -g github-runner /opt/cooperativa-app
   sudo -u github-runner git clone https://github.com/<usuario>/cooperativa-app.git /opt/cooperativa-app
   ```
   Cree `/opt/cooperativa-app/.env` como en la sección 9.2, con dueño `github-runner` y permiso `600`, y agregue las variables de producción de `.env.example`: `COMPOSE_FILE`, `FRONTEND_BIND_IP`, `UPLOADS_DIR` y `FRONTEND_URL` con la dirección del portal. Genere las claves con `openssl rand -hex 32`: un valor con `$` o comillas haría que Compose muestre parte de él en sus advertencias, y el despliegue se detiene ante cualquier advertencia.
6. **Reserva de IP.** Reserve en el router la IP del servidor. Si cambia, el portal no puede publicarse en `FRONTEND_BIND_IP`.

**Reglas de operación.**
- En `/opt/cooperativa-app` no se edita código: todo cambio llega por un PR.
- Para volver a desplegar `main` sin un cambio nuevo, ejecute el workflow `Despliegue` desde la pestaña *Actions* (*Run workflow*).
- Los registros de Actions de un repositorio público son públicos: el workflow no imprime el `.env`, ni la salida de `docker compose config`, ni registros de contenedores. Ante un fallo indica qué revisar en el servidor.
- El portal se sirve por HTTP dentro de la red local. Quien comparta esa red podría leer el tráfico, incluidas contraseñas y sesiones. Es un riesgo aceptado en este ambiente de práctica; un uso real exige HTTPS con un certificado de una autoridad interna.

**Restaurar un respaldo.** Detenga la aplicación, restaure como superusuario y vuelva a desplegar `main` para que las migraciones y los permisos queden al día. Las dos bases se respaldan en momentos cercanos pero distintos: después de restaurar, revise *Conciliación* por operaciones con el banco que hayan quedado a medias.
```bash
cd /srv/cooperativa/respaldos/<carpeta>
docker stop cooperativa-frontend cooperativa-backend banco-backend
docker exec -i cooperativa-db pg_restore -U <DB_ADMIN_USER> -d cooperativa_db --clean --if-exists < cooperativa_db.dump
docker exec -i cooperativa-db pg_restore -U <DB_ADMIN_USER> -d banco_db --clean --if-exists < banco_db.dump
docker run --rm -i --network none -v /srv/cooperativa/uploads:/u postgres:16-alpine tar xzf - -C /u < uploads.tar.gz
```

---

## 10. Configuracion de Variables de Entorno

El archivo `.env` de la raíz (copia de `.env.example`) centraliza los parametros de configuracion para los contenedores:

| Variable | Descripcion | Valor Predeterminado / Ejemplo |
|:---|:---|:---|
| `DB_NAME` | Nombre de la base de datos principal | `cooperativa_db` |
| `DB_ADMIN_USER` | Superusuario de PostgreSQL (solo `db` y `db-roles`) | `cooperativa_user` |
| `DB_ADMIN_PASSWORD` | Contrasena del superusuario (**obligatoria**) | *(Generar con `openssl rand -hex 32`)* |
| `DB_OWNER_USER` | Rol dueño de las tablas (solo migraciones) | `cooperativa_owner` |
| `DB_OWNER_PASSWORD` | Contrasena del rol dueño (**obligatoria**) | *(Generar con `openssl rand -hex 32`)* |
| `DB_USER` | Rol con el que trabajan el backend y el banco | `cooperativa_app` |
| `DB_PASSWORD` | Contrasena del rol de la aplicacion (**obligatoria**) | *(Generar con `openssl rand -hex 32`)* |
| `DB_PORT` | Puerto de PostgreSQL en esta máquina | `5432` |
| `BACKEND_PORT` | Puerto del backend en esta máquina | `5001` |
| `JWT_SECRET` | Clave secreta para firma de tokens JWT (**obligatoria**) | *(Generar con `openssl rand -hex 32`)* |
| `JWT_EXPIRES_IN` | Tiempo de vida del token de acceso | `8h` |
| `BANCO_INTERNAL_API_KEY` | Clave entre la cooperativa y el Core Banking (**obligatoria**) | *(Generar con `openssl rand -hex 32`)* |
| `FRONTEND_PORT` | Puerto del portal web en esta máquina | `3000` |
| `FRONTEND_URL` | Origen autorizado para CORS y WebSockets | `http://localhost:3000` |
| `MAIL_ENABLED` | `false` apaga todo envío de correo | `true` |
| `GMAIL_USER` | Cuenta de Gmail para las notificaciones | *(Opcional)* |
| `GMAIL_APP_PASSWORD` | Contrasena de aplicacion de Google | *(16 caracteres, opcional)* |
| `EMAIL_FROM` | Remitente de los correos | `Cooperativa Financiera <notificaciones@cooperativa.com>` |
| `COMPOSE_FILE` | Solo en producción: aplica `docker-compose.produccion.yml` encima del compose base | `docker-compose.yml:docker-compose.produccion.yml` |
| `FRONTEND_BIND_IP` | Solo en producción: IP de la red local en que se publica el portal | `192.168.0.2` |
| `UPLOADS_DIR` | Solo en producción: carpeta de los archivos subidos, fuera del código (uid 1000) | `/srv/cooperativa/uploads` |

Para ejecutar el backend o el banco fuera de Docker, `backend/.env` y `banco-backend/.env` (copias de sus `.env.example`) deben tener la misma `BANCO_INTERNAL_API_KEY`.

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
| `testUsuarioDoble.js` | Persona con usuario del personal y de asociado: llave `id_usuario`, sesiones y estados separados, auditoria, tokens anteriores, nadie atiende sus propios tramites y afiliacion del personal por cada canal (issue #32). |
| `testValidacionSesion.js` | Solo la sesion vigente abre rutas y WebSockets: el token del segundo paso del 2FA y los de sesiones cerradas se rechazan, y un socket solo cierra su propia sesion. |
| `testErroresFase3.js` | Limites del credito, desistir como cancelada, parentesco unico, documentos propios del asociado, estado del asociado auditado, usuario sin fecha de nacimiento, correo unico sin mayusculas y secuencia de traslados. |
| `testReportes.js` | Reportes de gestion: permisos por rol, validacion de filtros, cierre de caja solo del operador que lo pide, totales que cuadran con la base, registro con folio de solo agregar y rechazo de un reporte que pasa del maximo de filas. |
| `testDocumentosAfiliacion.js` | Documentos de afiliacion: validacion por contenido, portal del asociado, versiones, revision del operador con cuatro ojos, segregacion, descarga protegida con registro de accesos y triggers que impiden cambiarlos o borrarlos. |

### Ejecucion de Pruebas

Las pruebas se ejecutan dentro de la red de Docker, con las mismas variables que el backend. La imagen no incluye los archivos `test*.js`, por eso se montan al ejecutarlas:

```bash
docker compose run --rm --no-deps -e MAIL_ENABLED=false \
  -v "$(pwd)/backend/testModulo1Completo.js:/app/testModulo1Completo.js:ro" \
  backend node testModulo1Completo.js
```

Cambie `testModulo1Completo.js` por el nombre de la prueba que quiera ejecutar.

**Correo en las pruebas.** Las pruebas que cargan el servidor fijan `MAIL_ENABLED=false` al inicio, así que no envían correos aunque haya una cuenta de Gmail configurada. `testBandejaAfiliaciones.js` y `testForcedPasswordChange.js` se conectan al backend que ya está corriendo (puerto 5001): ejecútelas solo con ese backend levantado con `MAIL_ENABLED=false` en `.env`. `testGoogleMailer.js` envía un correo real a propósito.

**Datos.** `testModulo1Completo.js` borra y vuelve a crear el asociado del cliente de prueba del banco (DPI `4000000000001`) y debita su cuenta de prueba.

---

## 12. Creditos y Datos Academicos

- **Institucion:** Universidad Mariano Galvez de Guatemala
- **Facultad:** Ingenieria en Sistemas de Informacion y Ciencias de la Computacion
- **Curso:** Proyecto de Graduacion 2 (Decimo Ciclo)
- **Ano Academico:** 2026
