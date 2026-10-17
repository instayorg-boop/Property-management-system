-- report_links.public_token previously defaulted to a full UUID (gen_random_uuid()), which makes
-- the auto-report SMS link (APP_URL/report/<token>) needlessly long for something sent by text.
-- Mirror generate_portal_token()'s approach (see 20260912020000_tenant_portal_tokens.sql): a short,
-- unambiguous token drawn from a 32-symbol alphabet with visually-confusable characters removed
-- (0/O, 1/I/L), with a collision retry loop since uniqueness is still enforced at the DB level.

create or replace function public.generate_report_token()
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
    select exists(select 1 from public.report_links where public_token = token) into already_used;
    exit when not already_used;
  end loop;
  return token;
end;
$$;

alter table public.report_links alter column public_token set default public.generate_report_token();

-- Existing rows keep their old (longer) tokens — any already-sent SMS/links stay valid; only new
-- reports generated from here on get the short form.
