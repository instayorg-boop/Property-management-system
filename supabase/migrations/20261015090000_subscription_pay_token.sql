-- A per-property token for the subscription payment reminder SMS, same idea as tenants'
-- portal_token (see 20260912020000_tenant_portal_tokens.sql): the landlord's subscription-due
-- SMS carries a link that pays IPM's own fee without making them log into the dashboard first,
-- exactly like a tenant paying rent from their own SMS link never has to sign in. The token is
-- the trust boundary (it only ever reaches a landlord via an SMS to their own phone), so there is
-- no separate OTP step, matching the tenant portal's reasoning for skipping one too.

create or replace function public.generate_settings_pay_token()
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
    select exists(select 1 from public.settings where subscription_pay_token = token) into already_used;
    exit when not already_used;
  end loop;
  return token;
end;
$$;

alter table public.settings add column if not exists subscription_pay_token text unique;

update public.settings set subscription_pay_token = public.generate_settings_pay_token() where subscription_pay_token is null;

alter table public.settings alter column subscription_pay_token set not null;
alter table public.settings alter column subscription_pay_token set default public.generate_settings_pay_token();
