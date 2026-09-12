-- pay_portal_resolve_token (added moments ago in 20260912020000) turned out to be the wrong shape
-- for the job — resolving a portal token needs to mint a portal_sessions row in the same step (so
-- the tenant skips OTP entirely, not just skips typing the slug/id), which requires the
-- service-role access an edge function has and a SECURITY DEFINER SQL function doesn't get for
-- free. Superseded by the pay-portal-resolve-token edge function before this ever shipped to a
-- release build, so dropped outright rather than left as unused dead surface.

drop function if exists public.pay_portal_resolve_token(text);
