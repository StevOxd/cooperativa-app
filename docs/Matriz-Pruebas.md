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

| ID | Entrada | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| UB-01 | `validateCui(' 1234 567890123 ')` | Válido, sin espacios | Aprobado |
| UB-02 | `validateCui('123')`, texto con letras, número o vacío | Inválido | Aprobado |
| UB-03 | `validateAge18` con 18 años cumplidos hace una semana | Válido | Aprobado |
| UB-04 | `validateAge18` con 18 años la próxima semana | Inválido | Aprobado |
| UB-05 | `validateMinimumAmount('100.00', 100)` | Acepta exactamente el mínimo | Aprobado |
| UB-06 | `validateMinimumAmount(99.99, 100)` | Rechaza | Aprobado |
| UB-07 | Beneficiarios con 33.33, 33.33 y 33.34 % | Válido: suman 100 % | Aprobado |
| UB-08 | Beneficiarios con 99 %, lista vacía o nula | Inválido | Aprobado |
| UB-09 | `validateCuiMiddleware` con DPI inválido | Responde 400 y no llama a `next` | Aprobado |
| UB-10 | `respuestaDeError` con un error inesperado | 500 con mensaje genérico, sin el detalle | Aprobado |
| UB-11 | `estadoPorFalloDelBanco` con 403, 500, sin estado y 404 | 403, 502, 502 y 400 | Aprobado |
| UB-12 | `fechaValida('2026-02-30')` | Inválida | Aprobado |
| UB-13 | `esId('+5')`, `esId('0x5')` | Inválido | Aprobado |
| UB-14 | `filtroUsuario('AD-1')` y `filtroUsuario('12')` | Busca por código y por id, sin confundirlos | Aprobado |
| UB-15 | `leerMonto('12abc')`, `'0'`, `'1.234'` | Error 400 | Aprobado |
| UB-16 | `normalizarParentesco('cónyuge')` | `CONYUGE` | Aprobado |
| UB-17 | `validatePassword('sinsimbolo123')` | Devuelve el mensaje de error | Aprobado |
| UB-18 | `ipDelCliente` con `X-Forwarded-For: 1.1.1.1, 192.0.2.7` | Usa `192.0.2.7`, la que agrega nginx | Aprobado |
| UB-19 | `userAgentDe` con 600 caracteres | Recorta a 500 | Aprobado |

## Pruebas de integración de la API

| ID | Entrada | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| IN-01 | `GET /api/health` | 200 | Aprobado |
| IN-02 | `GET /api/no-existe` | 404 | Aprobado |
| IN-03 | `POST /api/auth/login` con credenciales de prueba correctas | 200 con token, sin `password_hash` | Aprobado |
| IN-04 | Login con contraseña incorrecta y con usuario inexistente | 401 con el mismo mensaje en ambos | Aprobado |
| IN-05 | Rutas protegidas sin sesión | 401 | Aprobado |
| IN-06 | Ruta protegida con un token falso | 403 | Aprobado |
| IN-07 | `GET /api/usuarios` como administrador | 200 | Aprobado |
| IN-08 | Usar un token después de cerrar sesión | 401 | Aprobado |
| IN-09 | Asignar a un usuario un código corporativo que ya existe | La base rechaza el cambio | Aprobado |

## Pruebas de regresión

Son los scripts existentes del proyecto, que ahora corren en cada pull request.

| ID | Script | Qué protege | Resultado obtenido |
|---|---|---|---|
| RE-01 | `testAuth.js` | Inicio de sesión y respuestas que no revelan cuentas | Aprobado |
| RE-02 | `testRBAC.js` | Permisos por rol | Aprobado |
| RE-03 | `testValidacionSesion.js` | Solo la sesión vigente abre rutas y WebSockets | Aprobado |
| RE-04 | `testTraslados.js` | Traslados y consistencia contable | Aprobado |
| RE-05 | `testModulo1Completo.js` | Afiliación digital y en agencia | Aprobado |
| RE-06 | `testConciliacion.js` | Depósitos y reversiones | Aprobado |
| RE-07 | `testDocumentosAfiliacion.js` | Validación, revisión y descarga de documentos | Aprobado |
| RE-08 | `testReportes.js` | Permisos, totales y registro de reportes | Aprobado |
| RE-09 | `testDatabaseIntegrity.js` | Migraciones, esquema e índices | Aprobado |
| RE-10 | `testUsuarioDoble.js` | Segregación de funciones | Aprobado |
| RE-11 | Los 14 scripts restantes de `scripts/regresion.js` | Lotes de errores ya corregidos | Aprobado |

No corren en el pipeline `testGoogleMailer.js`, porque envía un correo real, ni `test2faFlow.js`, `testBandejaAfiliaciones.js`, `testCybersecurity.js` y `testForcedPasswordChange.js`, porque necesitan el backend levantado en otro proceso.

## Pruebas del frontend

| ID | Entrada | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| UF-01 | `celdaCsv('=1+1')` | Neutraliza la fórmula de Excel | Aprobado |
| UF-02 | `formatDateOnly('2026-10-30T00:00:00.000Z')` | `30/10/2026`, sin cambiar de día | Aprobado |
| UF-03 | `esIngreso` con saldo que sube y tipo `TRANSFERENCIA` | Es ingreso | Aprobado |
| UF-04 | `checkPassword('sinnumeros!')` | Inválida, falta el número | Aprobado |
| UF-05 | Estado de cuenta con 120 movimientos | PDF válido de más de una página | Aprobado |
| UF-06 | Cada reporte de gestión | Se exporta a CSV y a PDF | Aprobado |
| CO-01 | `Button` mientras carga | Ignora el clic y conserva el foco | Aprobado |
| CO-02 | `PasswordInput` | Oculta la clave hasta que se pide verla | Aprobado |
| CO-03 | `Modal` cerrado y con Escape | No se muestra; se cierra | Aprobado |
| FL-01 | Ruta privada sin sesión | Redirige a login | Aprobado |
| FL-02 | Asociado entra a `/usuarios` | Vuelve al inicio | Aprobado |
| FL-03 | Sesión rechazada por el servidor | Se cierra y limpia el navegador | Aprobado |
| FL-04 | Login correcto | Envía las credenciales y entra | Aprobado |
| FL-05 | Respuesta 401 fuera del login | Limpia la sesión | Aprobado |
| FL-06 | Respuesta 413 de nginx | Muestra un mensaje para el usuario | Aprobado |
| FL-07 | Usuario nuevo con datos incompletos | No se envía al servidor | Aprobado |
| FL-08 | Usuario nuevo con datos válidos | `POST /usuarios` con esos datos | Aprobado |
| FL-09 | Afiliación presencial vacía | No se envía al servidor | Aprobado |
| FL-10 | DPI en la afiliación presencial | Consulta las cuentas en el banco | Aprobado |
| FL-11 | Simulador con otro monto y plazo | Actualiza el cálculo | Aprobado |
| FL-12 | Solicitud de crédito | `POST /asociado/creditos/iniciar` | Aprobado |
| FL-13 | Afiliación pública con DPI incompleto | No se consulta | Aprobado |
| FL-14 | Cliente del banco con credenciales inválidas | Muestra el error del servidor | Aprobado |
| FL-15 | Reiniciar la contraseña de un usuario | `POST /usuarios/:id/reset-password` y recarga la lista | Aprobado |
| FL-16 | Desactivar a un usuario con motivo | `PATCH` del estado y recarga la lista | Aprobado |
| FL-17 | Editar el correo de un usuario | `PUT /usuarios/:id` con el correo nuevo | Aprobado |
| FL-18 | Buscar un usuario por código | Vuelve a pedir la lista | Aprobado |
| FL-19 | Buscar en el padrón de asociados | Pide la primera página | Aprobado |
| FL-20 | Ver el historial de traslados | `GET /operador/traslados/historial` | Aprobado |
