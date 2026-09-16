-- READ-ONLY audit query — paste-and-run in the Supabase SQL Editor, copy the single JSON result
-- back into the chat. Only SELECTs; nothing is inserted/updated/deleted.

select jsonb_pretty(jsonb_build_object(
  'active_tenant_count', (select count(*) from tenants where active = true),

  'active_tenants', (
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'rent_amount', t.rent_amount,
      'owed_amount', t.owed_amount, 'status', t.status, 'days_overdue', t.days_overdue
    ) order by t.name)
    from tenants t where t.active = true
  ),

  'ledger_entries_count_by_source', (
    select jsonb_object_agg(coalesce(source, 'NULL'), cnt)
    from (select source, count(*) as cnt from ledger_entries group by source) s
  ),

  'recent_ledger_entries', (
    select jsonb_agg(row_to_json(r))
    from (
      select id, tenant_id, label, amount, paid_amount, status, period, method, source, created_at
      from ledger_entries
      order by created_at desc
      limit 20
    ) r
  ),

  'ledger_anomalies', jsonb_build_object(
    'amount_zero_count', (select count(*) from ledger_entries where amount = 0),
    'paid_amount_gt_amount_count', (select count(*) from ledger_entries where paid_amount is not null and paid_amount > amount),
    'negative_amount_count', (select count(*) from ledger_entries where amount < 0),
    'null_paid_amount_count', (select count(*) from ledger_entries where paid_amount is null),
    'null_period_count', (select count(*) from ledger_entries where period is null),
    'total_ledger_entries', (select count(*) from ledger_entries)
  ),

  'active_tenant_ledger_comparison', (
    select jsonb_agg(jsonb_build_object(
      'tenant_id', t.id,
      'name', t.name,
      'status', t.status,
      'owed_amount', t.owed_amount,
      'ledger_row_count', coalesce(le.row_count, 0),
      'open_ledger_rows', coalesce(le.open_count, 0),
      'sum_ledger_amount', coalesce(le.sum_amount, 0),
      'sum_ledger_paid', coalesce(le.sum_paid, 0)
    ) order by t.name)
    from tenants t
    left join lateral (
      select
        count(*) as row_count,
        count(*) filter (where status in ('unpaid','overdue','partial')) as open_count,
        sum(amount) as sum_amount,
        sum(coalesce(paid_amount, case when status = 'paid' then amount else 0 end)) as sum_paid
      from ledger_entries
      where tenant_id = t.id
    ) le on true
    where t.active = true
  ),

  'flags', jsonb_build_object(
    'owed_zero_but_not_paid', (
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'owed_amount', owed_amount))
      from tenants where active = true and owed_amount = 0 and status <> 'paid'
    ),
    'paid_but_owed_positive', (
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'owed_amount', owed_amount))
      from tenants where active = true and status = 'paid' and owed_amount > 0
    ),
    'overdue_days_but_status_not_overdue', (
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'days_overdue', days_overdue))
      from tenants where active = true and days_overdue > 0 and status <> 'overdue'
    ),
    'status_overdue_but_no_days', (
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'days_overdue', days_overdue))
      from tenants where active = true and status = 'overdue' and (days_overdue is null or days_overdue = 0)
    )
  )
)) as audit_report;
