# Reglas y Arquitectura del Proyecto

## Alcance Actual (Primera Entrega)
- Únicamente implementar:
  1. Autenticación / Login con JWT.
  2. Módulo de Gestión de Usuarios (CRUD completo con cambio de estado lógico Activo/Inactivo).

## Ecosistema Tecnológico
- **Backend:** Node.js, Express.js.
- **Base de Datos:** PostgreSQL.
- **Autenticación:** JSON Web Tokens (JWT) + bcryptjs para hashing de contraseñas.
- **Frontend:** React (Vite), TailwindCSS (o CSS/UI framework preferido), Axios.

## Reglas de Negocio para Usuarios
1. Cada usuario tiene un rol (Administrador, Operador, Asociado).
2. El borrado de usuarios DEBE ser un borrado lógico mediante un campo `estado` (`'ACTIVO'`, `'INACTIVO'`). No se hace `DELETE` directo en base de datos.
3. Las contraseñas deben estar encriptadas obligatoriamente en base de datos.