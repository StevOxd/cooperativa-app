-- =============================================================================
-- Bloque que database-roles.sql ejecuta en cada base, después de \connect. Usa sus variables :dueno y :app.
-- =============================================================================

-- 1. El esquema y sus objetos pasan al rol dueño: tablas, vistas, vistas materializadas, secuencias sueltas,
--    funciones y tipos propios. Las secuencias de las columnas SERIAL cambian de dueño junto con su tabla, y lo que
--    pertenece a una extensión se queda con ella.
SELECT format('ALTER SCHEMA public OWNER TO %I', :'dueno') \gexec
SELECT format('ALTER TABLE public.%I OWNER TO %I', tablename, :'dueno')
FROM pg_tables WHERE schemaname = 'public' AND tableowner <> :'dueno' \gexec
SELECT format('ALTER VIEW public.%I OWNER TO %I', viewname, :'dueno')
FROM pg_views WHERE schemaname = 'public' AND viewowner <> :'dueno' \gexec
SELECT format('ALTER MATERIALIZED VIEW public.%I OWNER TO %I', matviewname, :'dueno')
FROM pg_matviews WHERE schemaname = 'public' AND matviewowner <> :'dueno' \gexec
SELECT format('ALTER SEQUENCE public.%I OWNER TO %I', c.relname, :'dueno')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'S' AND n.nspname = 'public' AND pg_get_userbyid(c.relowner) <> :'dueno'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i', 'e')) \gexec
SELECT format('ALTER ROUTINE %s OWNER TO %I', p.oid::regprocedure, :'dueno')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> :'dueno'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e') \gexec
SELECT format('ALTER TYPE public.%I OWNER TO %I', t.typname, :'dueno')
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'r', 'm') AND t.typelem = 0
  AND pg_get_userbyid(t.typowner) <> :'dueno'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e') \gexec

-- 2. Solo el dueño crea objetos; la aplicación usa el esquema. Sus permisos sobre cada tabla y secuencia los fijan
--    las migraciones al terminar (backend: runMigrations; banco: initBancoDb), que conocen las tablas de solo
--    agregar y las pocas en que se borra: aquí no se dan, para no devolverle lo que ellas le quitaron.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app') \gexec
SELECT format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', :'app') \gexec

-- 3. Lo que el rol dueño cree después nace con lectura y escritura para la aplicación (sin DELETE ni setval);
--    las migraciones ajustan al final lo que corresponda
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM %I', :'dueno', :'app') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO %I', :'dueno', :'app') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', :'dueno', :'app') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'dueno', :'app') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', :'dueno', :'app') \gexec
