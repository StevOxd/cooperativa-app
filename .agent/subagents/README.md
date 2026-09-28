# Catálogo de Subagentes Especializados - Cooperativa App

Este directorio contiene las especificaciones y alcances de los cinco subagentes creados para auditar y verificar continuamente la calidad técnica del proyecto:

| Subagente | Archivo de Especificación | Rol Principal | Enfoque Clave |
| :--- | :--- | :--- | :--- |
| **`code-reviewer`** | [`code-reviewer.md`](./code-reviewer.md) | Revisor de Código | Clean Code, SOLID, DRY, JSDoc 3, eliminación de emojis en logs de producción, React hooks y suites de prueba. |
| **`database-admin`** | [`database-admin.md`](./database-admin.md) | DBA / Optimización BD | Normalización 3FN, B-Tree en FKs, índices compuestos/parciales, secuencias atómicas, inmutabilidad y borrado lógico. |
| **`cybersecurity-auditor`** | [`cybersecurity-auditor.md`](./cybersecurity-auditor.md) | Ciberseguridad | OWASP Top 10, CWE-798, anti-fuerza bruta, sesión concurrente única (WebSockets), MFA/TOTP, RBAC y Helmet. |
| **`software-architect`** | [`software-architect.md`](./software-architect.md) | Arquitecto de Software | Arquitectura multicapa, desacoplamiento del Core Banking (`banco-backend`), contratos REST y Docker Compose. |
| **`ux-ui-designer`** | [`ux-ui-designer.md`](./ux-ui-designer.md) | Experiencia y Diseño UI | Estética bancaria, accesibilidad WCAG/a11y, flujos por rol, estados de carga/error, diseño responsivo y TailwindCSS. |

---

## 🚀 Uso e Invocación
Los subagentes están registrados en el entorno de desarrollo y pueden ser invocados mediante la herramienta `invoke_subagent` indicando su nombre (`code-reviewer`, `database-admin`, `cybersecurity-auditor`, `software-architect` o `ux-ui-designer`).
