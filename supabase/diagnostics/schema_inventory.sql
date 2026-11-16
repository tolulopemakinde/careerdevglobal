-- CareerDev Global read-only schema metadata inventory.
-- Safe for owner-authorized SQL Editor / psql review.
-- This query returns metadata only: no application table rows and no function bodies.
-- Save the result with project ref, timestamp, PostgreSQL version, and tool version.
-- It does not mutate database state and is not a substitute for a schema-only dump.

WITH
table_columns AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', c.table_schema,
    'table', c.table_name,
    'ordinal', c.ordinal_position,
    'column', c.column_name,
    'data_type', c.data_type,
    'udt_schema', c.udt_schema,
    'udt_name', c.udt_name,
    'nullable', c.is_nullable,
    'identity', c.is_identity,
    'generated', c.is_generated
  ) ORDER BY c.table_schema, c.table_name, c.ordinal_position) AS data
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE t.table_type = 'BASE TABLE'
    AND c.table_schema NOT IN ('information_schema')
    AND c.table_schema NOT LIKE 'pg_%'
),
constraints AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'table', r.relname,
    'name', con.conname,
    'type', con.contype,
    'definition', pg_get_constraintdef(con.oid, true)
  ) ORDER BY n.nspname, r.relname, con.conname) AS data
  FROM pg_constraint con
  JOIN pg_class r ON r.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname NOT IN ('information_schema')
    AND n.nspname NOT LIKE 'pg_%'
),
indexes AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', schemaname,
    'table', tablename,
    'name', indexname,
    'definition', indexdef
  ) ORDER BY schemaname, tablename, indexname) AS data
  FROM pg_indexes
  WHERE schemaname NOT IN ('information_schema')
    AND schemaname NOT LIKE 'pg_%'
),
policies AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', schemaname,
    'table', tablename,
    'name', policyname,
    'permissive', permissive,
    'roles', roles,
    'command', cmd,
    'using', qual,
    'with_check', with_check
  ) ORDER BY schemaname, tablename, policyname) AS data
  FROM pg_policies
  WHERE schemaname NOT IN ('information_schema')
    AND schemaname NOT LIKE 'pg_%'
),
triggers AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'table', r.relname,
    'name', tg.tgname,
    'enabled', tg.tgenabled,
    'definition', pg_get_triggerdef(tg.oid, true),
    'function_schema', pn.nspname,
    'function_name', p.proname,
    'function_identity_arguments', pg_get_function_identity_arguments(p.oid)
  ) ORDER BY n.nspname, r.relname, tg.tgname) AS data
  FROM pg_trigger tg
  JOIN pg_class r ON r.oid = tg.tgrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  JOIN pg_proc p ON p.oid = tg.tgfoid
  JOIN pg_namespace pn ON pn.oid = p.pronamespace
  WHERE NOT tg.tgisinternal
    AND n.nspname NOT IN ('information_schema')
    AND n.nspname NOT LIKE 'pg_%'
),
functions AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'name', p.proname,
    'kind', p.prokind,
    'language', l.lanname,
    'identity_arguments', pg_get_function_identity_arguments(p.oid),
    'result_type', pg_get_function_result(p.oid),
    'security_definer', p.prosecdef,
    'volatility', p.provolatile,
    'config', p.proconfig
  ) ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS data
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname NOT IN ('information_schema')
    AND n.nspname NOT LIKE 'pg_%'
    AND p.prokind IN ('f', 'p')
),
extensions AS (
  SELECT jsonb_agg(jsonb_build_object(
    'name', e.extname,
    'version', e.extversion,
    'schema', n.nspname
  ) ORDER BY e.extname) AS data
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
),
enums AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'name', t.typname,
    'labels', (
      SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid = t.oid
    )
  ) ORDER BY n.nspname, t.typname) AS data
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE t.typtype = 'e'
    AND n.nspname NOT IN ('information_schema')
    AND n.nspname NOT LIKE 'pg_%'
),
relations AS (
  SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'name', c.relname,
    'kind', c.relkind,
    'row_level_security', c.relrowsecurity,
    'force_row_level_security', c.relforcerowsecurity
  ) ORDER BY n.nspname, c.relname) AS data
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    AND n.nspname NOT IN ('information_schema')
    AND n.nspname NOT LIKE 'pg_%'
)
SELECT jsonb_build_object(
  'captured_at_utc', now() AT TIME ZONE 'UTC',
  'database_name', current_database(),
  'server_version', current_setting('server_version'),
  'table_columns', COALESCE((SELECT data FROM table_columns), '[]'::jsonb),
  'constraints', COALESCE((SELECT data FROM constraints), '[]'::jsonb),
  'indexes', COALESCE((SELECT data FROM indexes), '[]'::jsonb),
  'rls_policies', COALESCE((SELECT data FROM policies), '[]'::jsonb),
  'user_triggers', COALESCE((SELECT data FROM triggers), '[]'::jsonb),
  'function_signatures_metadata_only', COALESCE((SELECT data FROM functions), '[]'::jsonb),
  'installed_extensions', COALESCE((SELECT data FROM extensions), '[]'::jsonb),
  'enum_types', COALESCE((SELECT data FROM enums), '[]'::jsonb),
  'relations', COALESCE((SELECT data FROM relations), '[]'::jsonb)
) AS schema_inventory;
