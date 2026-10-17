-- =============================================================================
-- Roles de la base de datos (mínimo privilegio)
--
-- Lo ejecuta el servicio db-roles de Docker Compose con el superusuario del contenedor (DB_ADMIN_USER), antes
-- de arrancar el backend y el banco. Es idempotente: se puede ejecutar en cada arranque y en una base que ya
-- tiene datos (transfiere los objetos existentes al rol dueño).
--
--   DB_OWNER_USER  dueño de las bases y de sus objetos; solo lo usan las migraciones al arrancar.
--   DB_USER        rol de la aplicación: solo lee y escribe datos. No crea tablas, no desactiva triggers,
--                  no es superusuario y no puede crear bases ni roles. Sus permisos sobre cada tabla los
--                  fijan las migraciones al terminar (las tablas del banco y las nuevas aún no existen aquí).
-- =============================================================================
\set ON_ERROR_STOP on
-- Las sentencias llevan contraseñas: no se escriben en el registro del servidor, ni aunque fallen
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SET log_min_duration_statement = -1;
\getenv dueno DB_OWNER_USER
\getenv dueno_clave DB_OWNER_PASSWORD
\getenv app DB_USER
\getenv app_clave DB_PASSWORD
\getenv bd DB_NAME

-- 0. Los dos roles deben tener nombre y contraseña, y ser distintos entre sí y del superusuario (un .env viejo
--    con DB_USER igual a DB_ADMIN_USER le quitaría los privilegios al superusuario); ninguno puede ser un
--    superusuario que ya exista. DB_NAME es un nombre simple y no una base del sistema ni la del banco.
SELECT format($f$DO $d$ BEGIN RAISE EXCEPTION %L; END $d$$f$,
  'DB_OWNER_USER y DB_USER deben tener valor y contraseña, y ser distintos entre sí y de DB_ADMIN_USER (vea .env.example)')
WHERE coalesce(:'dueno', '') = '' OR coalesce(:'app', '') = ''
   OR coalesce(:'dueno_clave', '') = '' OR coalesce(:'app_clave', '') = ''
   OR :'dueno' = :'app' OR :'dueno' = current_user OR :'app' = current_user
   OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN (:'dueno', :'app') AND rolsuper) \gexec
SELECT format($f$DO $d$ BEGIN RAISE EXCEPTION %L; END $d$$f$,
  'DB_NAME debe ser un nombre simple (minúsculas, números y _) y no puede ser postgres, template0, template1 ni banco_db')
WHERE coalesce(:'bd', '') !~ '^[a-z_][a-z0-9_]*$' OR :'bd' IN ('postgres', 'template0', 'template1', 'banco_db') \gexec

-- 1. Roles: se crean si faltan y siempre quedan sin privilegios especiales y con la contraseña del .env
SELECT format('CREATE ROLE %I LOGIN', r) FROM unnest(ARRAY[:'dueno', :'app']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'dueno', :'dueno_clave') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app', :'app_clave') \gexec
-- Ninguno de los dos hereda permisos de otro rol (por ejemplo, la aplicación del dueño)
SELECT format('REVOKE %I FROM %I GRANTED BY %I', r.rolname, m.rolname, g.rolname)
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles g ON g.oid = am.grantor
WHERE m.rolname IN (:'dueno', :'app') \gexec

-- 2. Bases: la del banco se crea si falta; las dos pasan al rol dueño y la aplicación solo se conecta (sin
--    tablas temporales). A las bases del sistema solo entra el superusuario.
SELECT 'CREATE DATABASE banco_db' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'banco_db') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', b, :'dueno') FROM unnest(ARRAY[:'bd', 'banco_db']) AS b \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC, %I', b, :'app') FROM unnest(ARRAY[:'bd', 'banco_db']) AS b \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', b, :'app') FROM unnest(ARRAY[:'bd', 'banco_db']) AS b \gexec
REVOKE CONNECT, TEMPORARY ON DATABASE postgres, template1 FROM PUBLIC;

-- 3. Objetos y permisos de cada base (el mismo bloque para las dos)
\connect :bd
\ir database-roles-permisos.sql
\connect banco_db
\ir database-roles-permisos.sql
