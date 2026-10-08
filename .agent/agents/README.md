# Subagentes del proyecto (Antigravity)

Cinco subagentes especializados que auditan y verifican la calidad técnica de la Cooperativa App. Están en el formato de subagente de Antigravity: frontmatter YAML con `name`, `description`, `model`, `subagent: true` y `tools`, seguido del prompt de sistema.

Llevan el mismo nombre que los revisores genéricos del kit global (`~/.gemini/config/agents/`), así que dentro de este repositorio **los reemplazan** con la versión específica del proyecto. Todos son de solo lectura (más ejecución de pruebas): reportan hallazgos con severidad y archivo:línea, y el agente principal corrige.

| Subagente | Archivo | Rol | Enfoque |
| :--- | :--- | :--- | :--- |
| `code-reviewer` | [`code-reviewer.md`](./code-reviewer.md) | Revisor de código | Clean Code, SOLID, DRY, JSDoc 3, logs sin emojis, hooks de React, suites de prueba y errores recurrentes del proyecto. |
| `db-reviewer` | [`db-reviewer.md`](./db-reviewer.md) | DBA PostgreSQL | 3FN, B-Tree en FKs, índices compuestos y parciales, secuencias atómicas, inmutabilidad, borrado lógico y migraciones idempotentes. |
| `security-auditor` | [`security-auditor.md`](./security-auditor.md) | Ciberseguridad | OWASP Top 10, CWE-798, anti-fuerza bruta, sesión única, 2FA TOTP, RBAC, Helmet y la lista de fallas reales ya corregidas. |
| `software-architect` | [`software-architect.md`](./software-architect.md) | Arquitectura | Capas backend y frontend, desacoplamiento del Core Banking, contratos REST, Docker Compose y planes de implementación. |
| `ux-reviewer` | [`ux-reviewer.md`](./ux-reviewer.md) | UX/UI | Sistema de diseño, flujos por rol, estados de carga/vacío/error, WCAG 2.1 AA, responsividad y seguridad en pantalla. |

## Cómo se usan
- **Automático:** el agente principal delega según la `description` de cada uno y según la regla global de revisar antes de cerrar un cambio.
- **Por nombre:** menciónalo en el prompt («pásalo por `security-auditor`») o desde el panel `/agents`.
- **Orquestados:** la skill global `/revision-cambios` lanza los que correspondan según los archivos del diff y consolida los hallazgos.

## Claude Code
Estos archivos son la **única fuente**. Claude Code usa copias generadas en `.claude/agents/` (mismo contenido, encabezado y nombres de herramientas de Claude Code: `view_file` → `Read`, `grep_search` → `Grep`, `find_by_name`/`list_dir` → `Glob`, `run_command` → `Bash`):

```bash
node scripts/sync-agents.mjs           # regenera .claude/agents/ después de editar aquí
node scripts/sync-agents.mjs --check   # lo corre el CI; falla si quedaron desincronizados
```

No edite `.claude/agents/` a mano. Las reglas llegan a Claude Code por `CLAUDE.md`, que importa `rules/PROJECT_RULES.md`.

## Reglas relacionadas
Las reglas maestras del proyecto están en [`../rules/PROJECT_RULES.md`](../rules/PROJECT_RULES.md) con `trigger: always_on`.
