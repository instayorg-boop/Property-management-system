-- Short per-tenant tokens for the payment portal — a tenant's SMS reminder link needs to be short
-- enough to actually send (pay.instay.co/p/AB12CD), and the previous /pay/:propertySlug/:tenantId
-- route (a slug plus a full UUID) is far too long for that, on top of forcing tenants through a
-- search step they don't need when they already have a link that's specifically theirs.
--
-- 6 chars, drawn from a 32-symbol alphabet with visually-confusable characters removed (0/O, 1/I/L)
-- so a token read aloud or retyped from a screenshot doesn't misfire — ~1 billion possible values,
-- plenty for how many tenants any single landlord will ever have, with a collision retry loop
-- anyway since uniqueness is enforced at the DB level regardless.

create or replace function public.generate_portal_token()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  token text;
  already_used boolean;
begin
  loop
    token := '';
    for i in 1..6 loop
      token := token || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    select exists(select 1 from public.tenants where portal_token = token) into already_used;
    exit when not already_used;
  end loop;
  return token;
end;
$$;

alter table public.tenants add column if not exists portal_token text unique;

update public.tenants set portal_token = public.generate_portal_token() where portal_token is null;

alter table public.tenants alter column portal_token set not null;
alter table public.tenants alter column portal_token set default public.generate_portal_token();

-- --- Token resolution --------------------------------------------------------------------------
-- The only thing /p/:token needs: which property slug + tenant id to redirect to. Deliberately
-- returns nothing else (no balance, no name) — the existing pay_portal_get_tenant_v2 (session-OTP
-- gated) is what actually reveals tenant data once they land on /pay/:slug/:id.

create or replace function public.pay_portal_resolve_token(p_token text)
returns table(property_slug text, tenant_id uuid)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  return query
  select p.slug, t.id
  from public.tenants t
  join public.properties p on p.id = t.property_id
  where t.portal_token = upper(trim(p_token)) and t.active = true;
end;
$$;

grant execute on function public.pay_portal_resolve_token(text) to anon, authenticated;
