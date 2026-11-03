# Línea base de calidad

Estado del proyecto antes de la intervención de SQA. Sirve de punto de comparación para [Reporte-Mejora.md](Reporte-Mejora.md).

| Dato | Valor |
|---|---|
| Commit medido | `c42866d` (tag `linea-base-sqa`) |
| Fecha de medición | 2026-11-02 |

## Tamaño del código

| Componente | Archivos JS/JSX | Líneas |
|---|---|---|
| `backend/src` | 64 | 19,168 |
| `frontend/src` | 139 | 23,062 |
| `banco-backend/src` | 8 | 1,432 |

## Pruebas y cobertura

| Métrica | Valor en la línea base |
|---|---|
| Scripts de prueba del backend | 30, casi todos necesitan la API levantada o PostgreSQL |
| Marco de pruebas | Ninguno: scripts de Node ejecutados uno por uno |
| Suite de pruebas unitarias | No existe. Solo `testArchitectureImprovements.js` usa `assert` directamente sobre funciones |
| Pruebas del frontend | 0 |
| Pruebas ejecutadas en el CI | 0 |
| Cobertura del frontend | 0 % (no hay pruebas) |
| Cobertura del backend, líneas | 79.15 % (15,169 de 19,164) |
| Cobertura del backend, ramas | 68.44 % (1,720 de 2,513) |
| Cobertura del backend, funciones | 85.31 % (302 de 354) |
| Umbral de cobertura | No existe |

**Cómo se midió la cobertura del backend:** con `c8` en Node 26, ejecutando en local 24 de los 30 scripts contra la base local. Los 24 terminaron correctamente. Quedaron fuera 5 scripts que usan el backend levantado en Docker y `scripts/test2faFlow.js`, para no enviar correos reales.

**Límites de esta medición:** `c8` cuenta todas las líneas de cada archivo, incluidos comentarios y líneas en blanco, así que el porcentaje puede salir más alto que con Istanbul. La comparación con el estado final debe hacerse con la misma herramienta. La medición se hizo a mano: el CI no ejecuta estas pruebas ni controla su cobertura.

| Carpeta de `backend/src` | Líneas cubiertas |
|---|---:|
| `routes` | 100.0 % |
| `config` | 98.5 % |
| `utils` | 97.1 % |
| `middlewares` | 83.9 % |
| `services` | 77.3 % |
| `server.js` | 74.5 % |
| `controllers` | 73.1 % |

## Análisis estático

| Métrica | Valor en la línea base |
|---|---|
| ESLint en el frontend | 143 archivos, 0 errores, 0 advertencias |
| ESLint en el backend y en banco-backend | Sin configurar. El CI solo revisa la sintaxis con `node --check` |
| Prettier | Sin configurar |

## SonarCloud

Primer análisis de `main` sobre `c42866d`, con la configuración por defecto (análisis automático, Quality Gate "Sonar way"). Incluye los scripts de prueba del backend, porque aún no se separaban del código de la aplicación.

| Métrica | Valor en la línea base |
|---|---:|
| Líneas de código | 44,638 |
| Calificación de seguridad | E |
| Calificación de fiabilidad | C |
| Calificación de mantenibilidad | A |
| Issues abiertos | 345 |
| Bugs | 61 |
| Vulnerabilidades | 45 |
| Code smells | 239 |
| Duplicación | 3.3 % (75 bloques) |
| Deuda técnica | 930 min (ratio 0.1 %) |
| Complejidad ciclomática | 8,463 |
| Complejidad cognitiva | 5,513 |
| Cobertura en SonarCloud | Sin dato: no se le enviaban reportes |
| Quality Gate | Sin calcular: todavía no había código nuevo |

| Severidad | Issues |
|---|---:|
| Blocker | 9 |
| Critical | 1 |
| Major | 110 |
| Minor | 225 |

## Vulnerabilidades en dependencias

Resultado de `npm audit` el 2026-11-02. Aquí solo van los totales.

| Componente | Críticas | Altas | Moderadas | Total |
|---|---:|---:|---:|---:|
| `backend` | 1 | 2 | 5 | 8 |
| `frontend` | 1 | 4 | 10 | 15 |
| `banco-backend` | 0 | 1 | 3 | 4 |
| **Total** | **2** | **7** | **18** | **27** |

## Pipeline y protección de la rama

| Control | Valor en la línea base |
|---|---|
| Workflow de CI | Dos trabajos: `Frontend` (lint y build) y `Backend` (instalación y sintaxis) |
| Etapas de pruebas, análisis y reporte | No existen |
| Quality gates | Solo fallos de lint, build o sintaxis. No hay umbrales de cobertura ni de análisis |
| Pull request obligatorio en `main` | Sí |
| Checks obligatorios | `Backend` y `Frontend` |
| Aprobaciones requeridas | 0 |
| Protección aplicada también al administrador | No |
| Despliegue continuo | Sí, a un servidor propio en red local, con aprobación manual |
