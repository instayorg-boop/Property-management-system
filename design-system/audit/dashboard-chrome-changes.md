# Dashboard chrome migration — diff summary

Migrated the landlord dashboard's app shell (`DashboardLayout.tsx`, `Sidebar.tsx`, `Header.tsx`,
`MobileBottomNav.tsx`, `GlobalSearch.tsx`, `NotificationsPanel.tsx`, `ThemeSwitcher.tsx`,
`SyncStatus.tsx`, `SyncToast.tsx`) from the legacy `bg-paper`/`bg-mist`/`text-ink`/`text-muted`/
`border-line`/`bg-brand` class names to the shadcn token surface (`bg-card`, `bg-background`,
`bg-surface-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`/
`text-primary`, `bg-destructive`) per tokens.md's guidance that new/rebuilt chrome should prefer
the shadcn names over the legacy ones. No hex values, spacing, or radii outside the token set were
introduced; the `dashboard-overview.md` archetype's shell spec (fixed ~240–260px left sidebar,
full-width top `Header`, scrollable `<main>` to the right) was already the layout's shape and is
preserved — the rebuild is a re-skin plus componentization, not a layout rewrite, since the shell
already matched the archetype structurally.

**Header.tsx** was the biggest structural change: the hand-rolled account dropdown (a manually
positioned absolute div with outside-click/escape listeners) was replaced with shadcn's
`DropdownMenu` (`DropdownMenuTrigger`/`Content`/`Item`/`Label`/`Separator`), and the account glyph
now uses `Avatar`/`AvatarImage`/`AvatarFallback` instead of a raw `<img>`/icon toggle — this drops
the component's manual `accountOpen` state and its click-outside effect entirely, since Radix owns
that behavior. The center search field became a button that opens `GlobalSearch` (was a live
`<input>` shadowing the same job the full-screen panel already does) to remove the duplicate
source of truth over the query string. Notifications kept their existing custom slide-over
(see below) rather than moving to `DropdownMenu`, since it's a full drawer of grouped content, not
a menu of actions.

**Sidebar.tsx** and **MobileBottomNav.tsx** got straight token swaps for nav-item states (active =
`border-primary`/`text-primary`, inactive = `text-muted-foreground` with `hover:bg-surface-muted`)
and a `Separator` between nav groups in place of relying purely on spacing, matching
list-table-view.md's note that dividers should be explicit (`border-border`) rather than
implicit whitespace.

**GlobalSearch.tsx** and **NotificationsPanel.tsx** got full token passes plus empty-state copy
rewrites per `empty-state.md`'s tone guidance: GlobalSearch's no-results state now reads "No
results for '{query}'" with a specific next step ("Try a tenant name, room number, or a page like
'Rent' or 'Settings'") instead of a bare "No matches for X"; NotificationsPanel's empty state now
distinguishes the genuine-zero-data case ("No notifications yet" / "Payments, maintenance updates,
and payouts will show up here as they happen") from the filtered "Unread" tab's empty case
("You're all caught up"), matching the archetype's filtered-empty vs. genuine-empty distinction.

**ThemeSwitcher.tsx**, **SyncStatus.tsx**, and **SyncToast.tsx** received straight token swaps
(`border-border`/`bg-card`/`text-foreground`/`shadow-md`) with no structural changes — their
existing behavior (system/light/dark toggle; offline/syncing/review/synced pill; toast queue) was
already correct for the spec.

Both themes were checked: because every replaced class now resolves through the `--color-*`
custom properties that `.theme-dark` already overrides in `src/index.css`, no chrome file
hardcodes a light-only or dark-only color. `npx tsc -b --noEmit` and `npx vite build` both pass
with no new errors — only the pre-existing, out-of-scope errors in `Tenants.tsx` and
`Accounting.tsx` remain, unchanged.
