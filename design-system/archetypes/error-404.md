# Archetype: Error / 404

Applies to: unknown-route fallback (currently `FeatureDetail.tsx` redirects to `/`
on an unknown slug rather than showing a dedicated 404 — the page inventory flags
this as a gap: there's no standalone 404 page component yet), and any payment
portal failure states (`PaymentFailed.tsx`, `TenantBalance.tsx`'s not-found state).

## Structure
- Same centered, illustration-forward shape as the empty-state archetype, at full
  viewport height (this is a whole-page state, not an in-content one):
  1. Illustration or large icon.
  2. Heading — plain language, not an HTTP status code as the headline ("Page not
     found," not "404").
  3. One line of body copy.
  4. Primary CTA — "Back to dashboard" (authed context) or "Back home" (marketing/
     portal context), plus a secondary "Contact support" link for payment-portal
     failures specifically (money is involved — always give a human-support out).

## Marketing vs. dashboard vs. portal chrome
- Marketing 404: rendered within `PageShell` (keeps Nav/Footer) so the user isn't
  stranded outside the site's navigation.
- Dashboard 404 (unknown authed route): rendered within `DashboardLayout` so the
  sidebar stays available.
- Payment portal failure (`PaymentFailed`): chrome-less like the rest of the
  portal, but must keep `PortalHeader`/`PortalFooter` for the support contact
  info they carry.

## Recommendation
- Add a dedicated `NotFound.tsx` per chrome context (or one component that takes
  a `variant` prop) during Phase 4, rather than continuing the current pattern of
  silently redirecting unknown feature slugs to `/` — a silent redirect hides
  genuine broken links from being noticed.
