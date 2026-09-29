# Archetype: Auth (login / signup / password)

Applies to: `SignIn.tsx`, `GetStarted.tsx`, `ForgotPassword.tsx`,
`ResetPassword.tsx`.

## Grid / layout structure
- Sign in / sign up (`SignIn.tsx`, `GetStarted.tsx`): keep the existing two-column
  split-screen shape — left column is the form (fixed width, ~440–480px, vertically
  centered), right column is a full-height brand/visual panel (`bg-primary` or a
  brand illustration, hidden below `lg`). This split-screen pattern is a common,
  well-tested auth layout and nothing in the Gusto research contradicts it.
- Forgot/reset password: single centered column (no split panel) — these are
  quick, narrow-scope tasks and don't need the visual weight of a full brand
  panel; matches their existing minimal centered layout.

## Where primary actions live
- Single primary button, full-width within the form column, directly below the
  last field (or below the password-strength meter where present).
- SSO/alternate options (Google) above the email/password fields with a
  `Separator` ("or continue with email") between them, if kept — SSO is a lower-
  friction path and research on Gusto's own auth flow confirms it leads.

## Information hierarchy
1. Logo/wordmark, small, top of the form column.
2. Heading ("Sign in to your account").
3. SSO button(s) + separator, if present.
4. Form fields (label-above-input, per create-edit-form archetype conventions).
5. Primary submit button.
6. Secondary link (e.g. "Don't have an account? Sign up") below the button,
   small, centered.

## Component composition
- `Input` for fields, `Button` for submit/SSO, a `Separator` with centered text
  for the "or" divider.
- Password fields: visible strength meter on signup (confirmed teardown pattern),
  not on sign-in (a strength meter on login is meaningless).
- Forgot/reset password's confirmation state ("check your email" / "password
  updated") swaps the form for a centered success message + icon, same structure
  as the empty-state archetype's heading + body + single CTA.

## Responsive collapse
- Split-screen auth: right visual panel hides below `lg`, left form column
  becomes full-width, centered, with side padding.
