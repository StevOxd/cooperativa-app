# Reporte de mejora

Comparación entre la línea base (`c42866d`, tag `linea-base-sqa`, [Linea-Base-Calidad.md](Linea-Base-Calidad.md)) y el estado final de `main`.

| Dato | Línea base | Estado final |
|---|---|---|
| Commit medido | `c42866d` | `fd3f56d` |
| Fecha | 2026-11-02 | 2026-11-04 |
| Cómo se midió | A mano en local, y primer análisis automático de SonarCloud | Ejecución del CI [41892451348](https://github.com/StevOxd/cooperativa-app/actions/runs/41892451348) y análisis de SonarCloud desde el CI |

## Resumen

| Métrica | Antes | Después | Cambio |
|---|---:|---:|---|
| Pruebas que corren en el CI | 0 | 69 unitarias, 11 de integración, 24 scripts de regresión y 146 del frontend | Todas bloquean el PR si fallan |
| Cobertura del backend, líneas (`c8`) | 79.15 % | 79.05 % | Igual, pero ahora con mínimo de 70 % en cada PR |
| Cobertura del frontend, líneas | 0 % | 62.75 % | Con mínimo de 60 % |
| Cobertura de las utilidades con prueba unitaria | Sin medir | 100 % | Con mínimo de 60 % |
| Cobertura en SonarCloud | Sin dato | 70.6 % | SonarCloud recibe los reportes de Jest, `c8` y Vitest |
| Errores de ESLint en backend y banco | 22 | 0 | ESLint configurado y obligatorio |
| Vulnerabilidades críticas y altas en dependencias | 9 | 0 | `npm audit` obligatorio |
| Quality Gate | Sin calcular | Passed | Obligatorio en cada PR |

## SonarCloud

| Métrica | Antes | Después |
|---|---:|---:|
| Calificación de seguridad | E | B |
| Calificación de fiabilidad | C | A |
| Calificación de mantenibilidad | A | A |
| Bugs | 61 | 0 |
| Vulnerabilidades | 45 | 10 |
| Code smells | 239 | 123 |
| Duplicación | 3.3 % (75 bloques) | 2.7 % (43 bloques) |
| Deuda técnica | 930 min | 405 min |
| Líneas de código | 44,638 | 37,726 |
| Complejidad ciclomática | 8,463 | 6,890 |
| Complejidad cognitiva | 5,513 | 4,525 |

**Comparabilidad.** El análisis de la línea base incluía los scripts de prueba del backend, porque todavía no se separaban del código de la aplicación. El análisis final los trata como pruebas. Por eso bajan las líneas de código y la complejidad, y parte de la baja de code smells viene de ese cambio de alcance y no de una corrección. Los bugs, las vulnerabilidades y las calificaciones sí se pueden comparar, porque los hallazgos Blocker y Critical estaban en el código de la aplicación.

**Lo que queda abierto.**

| Hallazgo | Cantidad | Decisión |
|---|---:|---|
| Vulnerabilidades Minor: datos del usuario en registros, `http` en enlaces de correo, CSP sin directivas `fetch` e imagen `nginx` como root | 10 | Deuda documentada |
| Code smells Major | 13 | Deuda documentada |
| Code smells Minor | 110 | Deuda documentada. Muchos son `parseInt` sin `Number.` en líneas sin pruebas |
| `isNaN` por `Number.isNaN` | — | No se cambia: altera las validaciones (`isNaN('abc')` es `true`, `Number.isNaN('abc')` es `false`) |

## Dependencias

| Componente | Críticas | Altas | Moderadas | Bajas |
|---|---:|---:|---:|---:|
| `backend` | 0 (antes 1) | 0 (antes 2) | 7 (antes 5) | 6 |
| `frontend` | 0 (antes 1) | 0 (antes 4) | 2 (antes 10) | 0 |
| `banco-backend` | 0 (antes 0) | 0 (antes 1) | 2 (antes 3) | 0 |

El CI falla con una vulnerabilidad alta o crítica. Las moderadas no lo bloquean.

## Pipeline y protección de la rama

| Control | Antes | Después |
|---|---|---|
| Etapas del CI | `Frontend` (lint y build) y `Backend` (instalación y sintaxis) | Build, Test, Analyze y Report |
| Quality gates | Solo fallos de lint, build o sintaxis | Pruebas, cobertura mínima, ESLint, Prettier, `npm audit` y Quality Gate de SonarCloud |
| Checks obligatorios en `main` | `Backend` y `Frontend` | `Build`, `Test`, `Analyze` y `Report` |
| Protección aplicada al administrador | No | Sí |
| Despliegue | Con aprobación manual | Solo después del CI aprobado en `main`, con aprobación manual |

## Cambios hechos al código de la aplicación

| PR | Qué corrigió |
|---|---|
| [#112](https://github.com/StevOxd/cooperativa-app/pull/112) | Pipeline, pruebas y configuración, los 22 errores de ESLint del backend y del banco, y las dependencias vulnerables |
| [#113](https://github.com/StevOxd/cooperativa-app/pull/113) | Los bugs de SonarCloud y sus vulnerabilidades Major y Critical: promesas sin manejar, `Math.random` en códigos, una expresión regular con retroceso excesivo, trabajo asíncrono en un constructor y `sort` sin comparador |
| [#114](https://github.com/StevOxd/cooperativa-app/pull/114) | Las 9 vulnerabilidades Blocker: la base ya no se crea con cuentas del personal. Las cuentas de prueba solo existen en desarrollo y en el CI, y una instalación nueva crea su primer administrador con un script |

## Rechazos del Quality Gate

El pipeline rechazó cambios reales durante el proyecto. Cada uno se corrigió antes de fusionar.

| PR | Etapa | Motivo |
|---|---|---|
| #112 | Analyze → ESLint | `banco-backend` no tenía el script `lint` |
| #112 | Analyze → SonarCloud | Un `sort()` sin comparador (Critical) y una acción de GitHub sin fijar a un commit |
| #113 | Analyze → SonarCloud | Cobertura del código nuevo de 71.4 % y duplicación de 4.9 %. Después, cobertura de 74.7 %, porque SonarCloud también cuenta las condiciones |
| #114 | Test → regresión | `testUsuarioDoble.js` detectó que las cuentas de prueba ya no tenían `id_usuario = id_persona`, como los datos anteriores |
| #114 | Analyze → SonarCloud | Duplicación del código nuevo de 12.8 % |

## Conclusiones

- **Lo que más cambió:** las verificaciones ahora existen y bloquean. La cobertura del backend ya era alta, pero nadie corría esas pruebas de forma automática.
- **El gate obliga a probar antes de corregir:** el código nuevo necesita 80 % de cobertura, así que corregir un issue en una línea sin pruebas exigió escribir esas pruebas primero.
- **La deuda que queda está a la vista:** 10 vulnerabilidades Minor y 123 code smells, ninguno Critical ni Blocker, cada grupo con su decisión.
