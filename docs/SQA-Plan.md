# Plan de Aseguramiento de la Calidad (SQA Plan)

**Proyecto:** Pipeline CI/CD con aseguramiento de calidad integrado, aplicado a Cooperativa App
**Curso:** Aseguramiento de la Calidad del Software
**Versión:** 1.0, del 2026-11-02

## 1. Propósito

Este plan define cómo se verifica la calidad de Cooperativa App y qué condiciones debe cumplir un cambio para entrar a `main`. El objetivo es que esa decisión dependa de controles automáticos con umbrales medibles, y comprobar con métricas de antes y después si la intervención mejoró el producto.

## 2. Alcance

**Producto:** sistema de una cooperativa de ahorro y crédito, desarrollado en el curso Proyecto de Graduación 2. Se reutiliza la aplicación existente. El curso no incluye desarrollarla desde cero.

| Incluye | No incluye |
|---|---|
| `backend`, `frontend` y `banco-backend` | Pruebas de carga, estrés o rendimiento |
| Pruebas unitarias, de integración y de regresión | Funciones nuevas de negocio |
| Análisis estático, cobertura y quality gates | |
| Corrección de issues críticos y mayores | |

**Variantes del stack sugerido**, permitidas por el enunciado si se justifican:

| Sugerido | Usado | Justificación |
|---|---|---|
| MySQL | PostgreSQL 16 | Es la base real del proyecto. Sus roles, permisos y triggers de auditoría forman parte de lo que se debe probar |
| Jest en el frontend | Vitest con React Testing Library | El frontend se construye con Vite y Vitest reutiliza esa configuración. Su API es casi igual a la de Jest |

## 3. Estándares

| Área | Referencia |
|---|---|
| Plan de calidad | IEEE 730 (estructura y actividades de SQA) |
| Características de calidad | ISO/IEC 25010 (fiabilidad, seguridad, mantenibilidad) |
| Seguridad de la API | OWASP API Security Top 10 |
| Estilo de código | ESLint y Prettier, con la configuración del repositorio |
| Mensajes de commit | Conventional Commits, como en el historial del proyecto |

## 4. Actividades

| Fase | Actividades | Evidencia |
|---|---|---|
| 1. Planeación | Este plan, entorno local, línea base | `SQA-Plan.md`, `Linea-Base-Calidad.md` |
| 2. Pruebas | Matriz de pruebas, unitarias, integración, regresión, cobertura | `Matriz-Pruebas.md`, reportes de cobertura |
| 3. Pipeline | Etapas, análisis estático, quality gates, protección de `main` | `.github/workflows/ci.yml`, panel de SonarCloud |
| 4. Mejora | Corrección de issues, medición final, comparación | `Reporte-Mejora.md`, `Manual-Tecnico.md` |
| 5. Cierre | Video, presentación, entrega | Video `.mp4`, diapositivas en PDF |

**Tipos de prueba**

| Tipo | Qué cubre | Herramientas |
|---|---|---|
| Unitaria | Utilidades, middlewares y servicios sin base de datos: montos, fechas, política de contraseñas, amortización. En el frontend, utilidades, hooks y componentes | Jest, Vitest, React Testing Library |
| Integración | Rutas de la API contra PostgreSQL real: autenticación, roles, afiliación, crédito, traslados | Jest, Supertest |
| Regresión | Los scripts `backend/test*.js` existentes, ejecutados en cada PR, y una prueba nueva por cada error corregido | Pipeline |

**Revisión de código**

- **Automática:** checks del pipeline y comentario de SonarCloud en cada pull request.
- **Manual:** el proyecto es individual y GitHub no permite aprobar un pull request propio. La revisión se documenta con una lista de verificación en la plantilla del pull request.

**Gestión de deuda técnica:** los hallazgos que no se corrijan en el momento quedan registrados con severidad y decisión. Críticos y mayores se corrigen dentro del proyecto. Los hallazgos de seguridad se manejan por advisory privado.

**Criterio para corregir issues antiguos:** el Quality Gate exige 80 % de cobertura y como máximo 3 % de duplicación en el código que cambia cada pull request. Por eso:

- Los bugs y vulnerabilidades se corrigen siempre. Si la línea no tiene pruebas, primero se escriben.
- Las correcciones menores de estilo (por ejemplo `Number.parseFloat`) solo se aplican en líneas con todas sus líneas y condiciones probadas.
- Las líneas dentro de bloques duplicados no se tocan sin refactorizar el bloque completo.
- Lo que queda pendiente se reporta como deuda técnica en `Reporte-Mejora.md`.

## 5. Métricas y quality gates

El pipeline falla si no se cumple alguna condición de la columna "Bloquea".

| Métrica | Umbral | Medida con | Bloquea |
|---|---|---|---|
| Pruebas unitarias, de integración y de regresión | 100 % aprobadas | Jest, Vitest | Sí |
| Cobertura de líneas del backend | ≥ 70 %, por encima del mínimo de 60 % del curso, porque la línea base medida es 79.15 % y un umbral menor permitiría retrocesos. Se ajusta si la medición en el pipeline da un valor distinto | `c8` y Jest | Sí |
| Cobertura de líneas del frontend | ≥ 60 % | Vitest (`thresholds`) | Sí |
| Cobertura de líneas de las utilidades del backend con prueba unitaria | ≥ 60 % | Jest (`coverageThreshold`) | Sí |
| Errores de ESLint | 0 en los tres componentes | ESLint | Sí |
| Formato del código nuevo de calidad (pruebas, configuración y workflow) | Sin diferencias | Prettier | Sí |
| Quality Gate de SonarCloud | Aprobado | SonarCloud | Sí |
| Vulnerabilidades críticas o altas en dependencias | 0 | `npm audit` | Sí |
| Bugs, code smells, duplicación y deuda técnica | Sin umbral propio: se reportan y se comparan con la línea base | SonarCloud | No |

Cualquier archivo que se excluya de la medición de cobertura se lista aquí con su motivo.

| Excluido | Motivo |
|---|---|
| `banco-backend/` | Simulador del banco que corre en su contenedor durante las pruebas. Sí pasa por ESLint, `npm audit` y SonarCloud |
| `frontend/src/main.jsx` | Solo monta la aplicación |
| `frontend/src/dev/` | Herramientas de desarrollo que no llegan a producción |
| Scripts y archivos de configuración | No son código de la aplicación |

**Prettier:** no se reformateó el código anterior, porque tocaría cientos de archivos de un sistema en uso sin cambiar su comportamiento. El código anterior se reporta como deuda técnica.

## 6. Herramientas

| Propósito | Herramienta |
|---|---|
| Repositorio y revisión | GitHub, pull requests, protección de `main` |
| CI/CD | GitHub Actions |
| Backend | Node.js 20, Express, PostgreSQL 16 |
| Frontend | React 18, Vite |
| Pruebas | Jest, Supertest, Vitest, React Testing Library |
| Cobertura | `c8` para los scripts de regresión, Jest y Vitest, con salida LCOV para SonarCloud |
| Análisis estático | ESLint, Prettier, SonarCloud |
| Contenedores | Docker, Docker Compose |
| Documentación | Markdown en `docs/` |

## 7. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Bajar de 60 % en el frontend: el valor está muy cerca del umbral (60.27 %) | Alta | Alto | Cada cambio en el frontend agrega sus pruebas. El pipeline rechaza lo que baje del umbral |
| R2 | Un merge de QA dispara un despliegue a producción, porque el repositorio también tiene CD | Media | Alto | El despliegue exige aprobación manual. Se aprueba solo cuando cambia código de la aplicación |
| R3 | Bloquear los merges al renombrar trabajos del CI, porque `Backend` y `Frontend` son checks obligatorios | Alta | Medio | Cambiar los trabajos y la protección de `main` en el mismo paso |
| R4 | Exponer datos o secretos en los registros de Actions, que son públicos | Baja | Alto | Credenciales de prueba desechables, tokens en GitHub Secrets y sin imprimir `.env` ni registros de contenedores |
| R5 | Pruebas inestables por compartir datos en la base | Media | Medio | Base nueva en cada ejecución del pipeline y datos propios por prueba |
| R6 | La intervención rompe la aplicación que se usa en Proyecto de Graduación | Media | Alto | Todo entra por pull request con el pipeline completo. Las refactorizaciones se limitan a lo necesario para probar o corregir |
