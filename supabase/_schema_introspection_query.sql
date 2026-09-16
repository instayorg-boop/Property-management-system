-- Paste-and-run in the Supabase SQL Editor. Copy the single JSON result cell back into the chat.
-- Read-only: this only SELECTs from Postgres's own catalog tables, it doesn't touch your data or schema.

select jsonb_pretty(jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'columns', (
        select jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'default', pg_get_expr(ad.adbin, ad.adrelid)
        ) order by a.attnum)
        from pg_attribute a
        left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      ),
      'constraints', (
        select jsonb_agg(jsonb_build_object(
          'name', con.conname,
          'type', con.contype,
          'definition', pg_get_constraintdef(con.oid)
        ))
        from pg_constraint con
        where con.conrelid = c.oid
      )
    ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  'views', (
    select jsonb_agg(jsonb_build_object('name', table_name, 'definition', view_definition))
    from information_schema.views where table_schema = 'public'
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'definition', pg_get_functiondef(p.oid)
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object(
      'name', t.tgname,
      'table', c.relname,
      'definition', pg_get_triggerdef(t.oid)
    ))
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'policy', policyname, 'cmd', cmd, 'roles', roles,
      'using', qual, 'check', with_check
    ))
    from pg_policies where schemaname = 'public'
  ),
  'enums', (
    select jsonb_agg(jsonb_build_object(
      'name', t.typname,
      'values', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid)
    ))
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
  )
)) as schema_dump;
