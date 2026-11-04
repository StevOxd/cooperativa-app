# Matriz de pruebas

Casos representativos de cada suite. La lista completa está en el código de cada archivo y el pipeline la ejecuta en cada pull request. El resultado obtenido corresponde a la última ejecución de la etapa Test.

## Suites

| Suite | Tipo | Herramienta | Ubicación | Necesita base de datos |
|---|---|---|---|---|
| Unitarias del backend | Unitaria | Jest | `backend/tests/unit/` | No |
| API | Integración | Jest, Supertest | `backend/tests/integration/` | Sí |
| Scripts del proyecto | Regresión | Node, `c8` | `backend/test*.js` | Sí |
| Frontend | Unitaria y de componentes | Vitest, React Testing Library | `frontend/src/test/` | No, usa una API simulada |

## Pruebas unitarias del backend

| ID | Tipo | Entrada | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| UB-01 | Unitaria | `validateCui(' 1234 567890123 ')` | Válido, sin espacios | Aprobado |
| UB-02 | Unitaria | `validateCui('123')`, texto con letras, número o vacío | Inválido | Aprobado |
| UB-03 | Unitaria | `validateAge18` con 18 años cumplidos hace una semana | Válido | Aprobado |
| UB-04 | Unitaria | `validateAge18` con 18 años la próxima semana | Inválido | Aprobado |
| UB-05 | Unitaria | `validateMinimumAmount('100.00', 100)` | Acepta exactamente el mínimo | Aprobado |
| UB-06 | Unitaria | `validateMinimumAmount(99.99, 100)` | Rechaza | Aprobado |
| UB-07 | Unitaria | Beneficiarios con 33.33, 33.33 y 33.34 % | Válido: suman 100 % | Aprobado |
| UB-08 | Unitaria | Beneficiarios con 99 %, lista vacía o nula | Inválido | Aprobado |
| UB-09 | Unitaria | `validateCuiMiddleware` con DPI inválido | Responde 400 y no llama a `next` | Aprobado |
| UB-10 | Unitaria | `respuestaDeError` con un error inesperado | 500 con mensaje genérico, sin el detalle | Aprobado |
| UB-11 | Unitaria | `estadoPorFalloDelBanco` con 403, 500, sin estado y 404 | 403, 502, 502 y 400 | Aprobado |
| UB-12 | Unitaria | `fechaValida('2026-02-30')` | Inválida | Aprobado |
| UB-13 | Unitaria | `esId('+5')`, `esId('0x5')` | Inválido | Aprobado |
| UB-14 | Unitaria | `filtroUsuario('AD-1')` y `filtroUsuario('12')` | Busca por código y por id, sin confundirlos | Aprobado |
| UB-15 | Unitaria | `leerMonto('12abc')`, `'0'`, `'1.234'` | Error 400 | Aprobado |
| UB-16 | Unitaria | `normalizarParentesco('cónyuge')` | `CONYUGE` | Aprobado |
| UB-17 | Unitaria | `validatePassword('sinsimbolo123')` | Devuelve el mensaje de error | Aprobado |
| UB-18 | Unitaria | `ipDelCliente` con `X-Forwarded-For: 1.1.1.1, 192.0.2.7` | Usa `192.0.2.7`, la que agrega nginx | Aprobado |
| UB-19 | Unitaria | `userAgentDe` con 600 caracteres | Recorta a 500 | Aprobado |

## Pruebas de integración de la API

| ID | Tipo | Entrada | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| IN-01 | Integración | `GET /api/health` | 200 | Aprobado |
| IN-02 | Integración | `GET /api/no-existe` | 404 | Aprobado |
| IN-03 | Integración | `POST /api/auth/login` con credenciales de prueba correctas | 200 con token, sin `password_hash` | Aprobado |
| IN-04 | Integración | Login con contraseña incorrecta y con usuario inexistente | 401 con el mismo mensaje en ambos | Aprobado |
| IN-05 | Integración | Rutas protegidas sin sesión | 401 | Aprobado |
| IN-06 | Integración | Ruta protegida con un token falso | 403 | Aprobado |
| IN-07 | Integración | `GET /api/usuarios` como administrador | 200 | Aprobado |
| IN-08 | Integración | Usar un token después de cerrar sesión | 401 | Aprobado |
| IN-09 | Integración | Asignar a un usuario un código corporativo que ya existe | La base rechaza el cambio | Aprobado |

## Pruebas de regresión

Son los scripts existentes del proyecto, que ahora corren en cada pull request. El resultado esperado es que el comportamiento descrito no cambie.

| ID | Tipo | Entrada (script) | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| RE-01 | Regresión | `testAuth.js` | Inicio de sesión y respuestas que no revelan cuentas | Aprobado |
| RE-02 | Regresión | `testRBAC.js` | Permisos por rol | Aprobado |
| RE-03 | Regresión | `testValidacionSesion.js` | Solo la sesión vigente abre rutas y WebSockets | Aprobado |
| RE-04 | Regresión | `testTraslados.js` | Traslados y consistencia contable | Aprobado |
| RE-05 | Regresión | `testModulo1Completo.js` | Afiliación digital y en agencia | Aprobado |
| RE-06 | Regresión | `testConciliacion.js` | Depósitos y reversiones | Aprobado |
| RE-07 | Regresión | `testDocumentosAfiliacion.js` | Validación, revisión y descarga de documentos | Aprobado |
| RE-08 | Regresión | `testReportes.js` | Permisos, totales y registro de reportes | Aprobado |
| RE-09 | Regresión | `testDatabaseIntegrity.js` | Migraciones, esquema e índices | Aprobado |
| RE-10 | Regresión | `testUsuarioDoble.js` | Segregación de funciones | Aprobado |
| RE-11 | Regresión | Los 14 scripts restantes de `scripts/regresion.js` | Lotes de errores ya corregidos | Aprobado |

No corren en el pipeline `testGoogleMailer.js`, porque envía un correo real, ni `test2faFlow.js`, `testBandejaAfiliaciones.js`, `testCybersecurity.js` y `testForcedPasswordChange.js`, porque necesitan el backend levantado en otro proceso.

## Pruebas del frontend

| ID | Tipo | Entrada | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| UF-01 | Unitaria | `celdaCsv('=1+1')` | Neutraliza la fórmula de Excel | Aprobado |
| UF-02 | Unitaria | `formatDateOnly('2026-10-30T00:00:00.000Z')` | `30/10/2026`, sin cambiar de día | Aprobado |
| UF-03 | Unitaria | `esIngreso` con saldo que sube y tipo `TRANSFERENCIA` | Es ingreso | Aprobado |
| UF-04 | Unitaria | `checkPassword('sinnumeros!')` | Inválida, falta el número | Aprobado |
| UF-05 | Unitaria | Estado de cuenta con 120 movimientos | PDF válido de más de una página | Aprobado |
| UF-06 | Unitaria | Cada reporte de gestión | Se exporta a CSV y a PDF | Aprobado |
| CO-01 | Componente | `Button` mientras carga | Ignora el clic y conserva el foco | Aprobado |
| CO-02 | Componente | `PasswordInput` | Oculta la clave hasta que se pide verla | Aprobado |
| CO-03 | Componente | `Modal` cerrado y con Escape | No se muestra; se cierra | Aprobado |
| FL-01 | Flujo de interfaz | Ruta privada sin sesión | Redirige a login | Aprobado |
| FL-02 | Flujo de interfaz | Asociado entra a `/usuarios` | Vuelve al inicio | Aprobado |
| FL-03 | Flujo de interfaz | Sesión rechazada por el servidor | Se cierra y limpia el navegador | Aprobado |
| FL-04 | Flujo de interfaz | Login correcto | Envía las credenciales y entra | Aprobado |
| FL-05 | Flujo de interfaz | Respuesta 401 fuera del login | Limpia la sesión | Aprobado |
| FL-06 | Flujo de interfaz | Respuesta 413 de nginx | Muestra un mensaje para el usuario | Aprobado |
| FL-07 | Flujo de interfaz | Usuario nuevo con datos incompletos | No se envía al servidor | Aprobado |
| FL-08 | Flujo de interfaz | Usuario nuevo con datos válidos | `POST /usuarios` con esos datos | Aprobado |
| FL-09 | Flujo de interfaz | Afiliación presencial vacía | No se envía al servidor | Aprobado |
| FL-10 | Flujo de interfaz | DPI en la afiliación presencial | Consulta las cuentas en el banco | Aprobado |
| FL-11 | Flujo de interfaz | Simulador con otro monto y plazo | Actualiza el cálculo | Aprobado |
| FL-12 | Flujo de interfaz | Solicitud de crédito | `POST /asociado/creditos/iniciar` | Aprobado |
| FL-13 | Flujo de interfaz | Afiliación pública con DPI incompleto | No se consulta | Aprobado |
| FL-14 | Flujo de interfaz | Cliente del banco con credenciales inválidas | Muestra el error del servidor | Aprobado |
| FL-15 | Flujo de interfaz | Reiniciar la contraseña de un usuario | `POST /usuarios/:id/reset-password` y recarga la lista | Aprobado |
| FL-16 | Flujo de interfaz | Desactivar a un usuario con motivo | `PATCH` del estado y recarga la lista | Aprobado |
| FL-17 | Flujo de interfaz | Editar el correo de un usuario | `PUT /usuarios/:id` con el correo nuevo | Aprobado |
| FL-18 | Flujo de interfaz | Buscar un usuario por código | Vuelve a pedir la lista | Aprobado |
| FL-19 | Flujo de interfaz | Buscar en el padrón de asociados | Pide la primera página | Aprobado |
| FL-20 | Flujo de interfaz | Ver el historial de traslados | `GET /operador/traslados/historial` | Aprobado |
