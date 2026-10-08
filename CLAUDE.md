# Cooperativa App: instrucciones para Claude Code

Este repositorio se trabaja con Claude Code y con Antigravity. La fuente de las reglas y de los subagentes es la de Antigravity (`.agent/`); Claude Code las lee desde aquí.

## Reglas del proyecto

@.agent/rules/PROJECT_RULES.md

## Subagentes

- Los subagentes de Claude Code (`.claude/agents/`) se **generan** desde `.agent/agents/` con `node scripts/sync-agents.mjs`. No se editan a mano: se edita el original en `.agent/agents/` y se vuelve a ejecutar el script. El CI falla si quedan desincronizados.
- Son de solo lectura: reportan hallazgos con archivo:línea y el agente principal corrige.

## Hallazgos fuera de la tarea

Los errores que se encuentren fuera del alcance de la tarea se anotan en `.agent/reportes/BITACORA_HALLAZGOS.md` (no se sube al repositorio). Los de seguridad se registran como advisory privado en GitHub, nunca como issue público ni en mensajes de commit o nombres de rama.

## Pruebas

- Backend: `backend/test*.js`. Las que cargan el servidor fijan `MAIL_ENABLED=false`; las que usan el backend levantado (puerto 5001) se corren con el backend sin correo.
- Las migraciones (`backend/src/config/migrations.js`) corren al arrancar el contenedor del backend: una tabla nueva exige `docker compose up -d --build backend` antes de probar.
- Frontend: `npm run lint` y `npm run build` en `frontend/`.
