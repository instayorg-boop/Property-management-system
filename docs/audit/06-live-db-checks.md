# 06 — Live database checks (run these first)

> **Update:** these were run on 2026-10-14 through the Supabase MCP. Results are in [07-live-db-findings.md](07-live-db-findings.md).

This audit couldn't connect to the IPM Supabase project. The connected Supabase account only sees an unrelated project. The base schema and ~20 functions exist only in the live DB (01 §4a), so these **read-only** queries confirm or overturn the findings marked † in 02/03.

Run them in the SQL editor of project `rlmcuhejgfftcdshbrbe`. None of them write anything.

```sql
-- 1. Is there a trigger I couldn't see that rolls balances forward? (affects M1)
select tgrelid::regclass as tbl, tgname, pg_get_triggerdef(oid)
from pg_trigger
where not tgisinternal
  and tgrelid in ('public.tenants'::regclass, 'public.ledger_entries'::regclass, 'public.collections'::regclass);

-- 2. How many tenants are stuck on the legacy model? (M1, W2)
select
  count(*) filter (where exists (select 1 from ledger_entries l where l.tenant_id = t.id and l.event_type is null)) as legacy,
  count(*) filter (where not exists (select 1 from ledger_entries l where l.tenant_id = t.id and l.event_type is null)) as new_model
from tenants t where t.active;

-- 3. Tenants showing "paid" while this month's charge is unpaid (M1 in action)
select t.id, t.name, t.status, t.owed_amount, l.label, l.amount
from tenants t
join ledger_entries l on l.tenant_id = t.id and l.event_type = 'charge' and l.voided_at is null
  and l.billing_period_id = to_char(now() at time zone 'Africa/Lusaka', 'YYYY-MM')
where t.active and t.owed_amount <= 0;

-- 4. Balance drift for new-model tenants
select t.id, t.name, t.owed_amount, b.balance
from tenants t, lateral calculate_tenant_balance(t.id) b
where t.active and t.owed_amount is distinct from b.balance;

-- 5. Security posture of every pay_portal_* / assistant_* function (S1, S2, S5)
select p.proname, p.prosecdef as security_definer, p.proacl,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and (p.proname like 'pay_portal%' or p.proname like 'assistant%' or p.proname like '%balance%')
order by 1;

-- 6. Do the old ungated v1 portal functions still exist? (S6)
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('pay_portal_get_tenant', 'pay_portal_get_ledger', 'pay_portal_log_payment');

-- 7. Read the assistant's free-form query function (S5)
select pg_get_functiondef('public.assistant_query'::regproc);

-- 8. Any public table without RLS?
select relname from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;

-- 9. All policies (look for 'true' / missing owner checks on assistant_*, statutory_rates, banks)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;

-- 10. Is properties.slug unique? (W1)
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'properties';

-- 11. Possible M5 victims: marked failed but Lenco gave us an id
select id, tenant_id, amount, status, failure_reason, lenco_collection_id, created_at
from collections
where status = 'failed' and (lenco_collection_id is not null or failure_reason ilike '%fetch%' or failure_reason ilike '%error%')
order by created_at desc;

-- 12. Stuck collections and payouts
select 'collection' as kind, id, status, created_at from collections
  where status in ('pending', 'pay-offline') and created_at < now() - interval '1 hour'
union all
select 'payout', id, status, created_at from payouts
  where status in ('pending', 'processing') and created_at < now() - interval '1 hour';

-- 13. Possible double payouts (M3/M4): failed payouts whose transfer may have gone through
select id, property_id, amount, net_amount, status, failure_reason, lenco_transaction_id, created_at
from payouts where status = 'failed' order by created_at desc;

-- 14. Duplicate rent charges for the same tenant + month
select tenant_id, billing_period_id, count(*)
from ledger_entries
where event_type = 'charge' and voided_at is null and billing_period_id is not null
group by 1, 2 having count(*) > 1;

-- 15. Cron health: are jobs scheduled, and are they failing?
select jobid, jobname, schedule, active from cron.job;
select jobid, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 30;

-- 16. Are the cron vault secrets present? (names only, never values)
select name from vault.secrets where name in ('cron_secret', 'functions_base_url');

-- 17. What does the pooled wallet owe landlords right now? Compare with the Lenco dashboard balance.
select sum(amount - coalesce(fee_amount, 0)) as owed_to_landlords_unclaimed,
       sum(coalesce(fee_amount, 0)) as ipm_fees_collected_all_time
from collections where status = 'successful' and payout_id is null;
```

Also run `npx supabase secrets list --project-ref rlmcuhejgfftcdshbrbe` and confirm:
- these are **set**: `LENCO_SECRET_KEY`, `AT_API_KEY`, `AT_USERNAME` (not `sandbox`), `RESEND_API_KEY`, `CRON_SECRET`, `GEMINI_API_KEY`;
- these are **unset**: `DEV_MODE_PAYMENTS`, `SMS_DEV_MODE`.

Also confirm with Lenco support which webhook URL is registered (`lenco-webhook/index.ts:33-34`).

**How to read the results:**
- Query 1 returns a balance-maintaining trigger → M1 may be less severe; re-check W3.
- Queries 11 or 13 return rows → there may be real customer money to fix **now**, before any build work.
- Query 5 shows `pay_portal_release_payout_collections` executable by `authenticated` → S2 is live. A `proacl` of NULL means the Postgres default, which is executable by PUBLIC, so that also counts as executable.
