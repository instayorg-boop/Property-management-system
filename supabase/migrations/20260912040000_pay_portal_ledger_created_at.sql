-- Adds created_at to the tenant portal's ledger read — the redesigned portal home page's "Recent
-- payments" list needs a real date per entry, which the previous shape didn't carry.
--
-- Postgres won't let create-or-replace change a function's OUT-parameter shape in place, so the
-- old signature has to be dropped first.

drop function if exists public.pay_portal_get_ledger_v2(uuid, text);

create function public.pay_portal_get_ledger_v2(p_tenant_id uuid, p_session_token text)
returns table(label text, amount numeric, paid_amount numeric, status text, created_at timestamptz)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not public.pay_portal_verify_session(p_tenant_id, p_session_token) then
    raise exception 'invalid or expired session';
  end if;

  return query
  select l.label, l.amount, l.paid_amount, l.status, l.created_at
  from public.ledger_entries l
  where l.tenant_id = p_tenant_id
  order by l.created_at desc;
end;
$$;

grant execute on function public.pay_portal_get_ledger_v2(uuid, text) to anon, authenticated;
