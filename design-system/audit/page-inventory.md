# Page inventory

Every route in `src/App.tsx`, its file, and the archetype it will be migrated
against in Phase 4. MVP-disabled routes (commented out in App.tsx but files still
present) are included and flagged — migrate them too so they're not stale when
re-enabled, but they're lower priority.

## Marketing (chrome: `Nav`/`Footer` or `PageShell`)

| Route | File | Archetype |
|---|---|---|
| `/` | `src/pages/Landing.tsx` | marketing-content (landing/feature-rich) |
| `/pricing` | `src/pages/Pricing.tsx` | marketing-content (landing/feature-rich) |
| `/how-it-works` | `src/pages/HowItWorks.tsx` | marketing-content (simple content) |
| `/features/:slug` | `src/pages/FeatureDetail.tsx` | marketing-content (landing/feature-rich) |
| `/about` | `src/pages/About.tsx` | marketing-content (landing/feature-rich) |
| `/careers` | `src/pages/Careers.tsx` | marketing-content (simple content) |
| `/contact` | `src/pages/Contact.tsx` | marketing-content (simple content) + create-edit-form (contact form) |
| `/help` | `src/pages/Help.tsx` | marketing-content (simple content, card-grid variant) |
| `/docs` | `src/pages/Docs.tsx` | marketing-content (simple content) |
| `/status` | `src/pages/Status.tsx` | marketing-content (simple content) |
| `/privacy` | `src/pages/Privacy.tsx` | marketing-content (simple content) |
| `/terms` | `src/pages/Terms.tsx` | marketing-content (simple content) |
| — (unknown route) | *none exists yet* | error-404 — **gap, create in Phase 4** |

Shared marketing components (not routes, migrate alongside their consuming pages):
`src/components/Nav.tsx`, `Hero.tsx`, `Footer.tsx`, `FeatureShowcase.tsx`,
`PricingSection.tsx`, `FaqSection.tsx`, `CTABanner.tsx`, `Compare.tsx`,
`ConnectedSection.tsx`, `IntegrationsSection.tsx`, `ProblemSection.tsx`,
`ScaleSection.tsx`, `ToolStrip.tsx`, `PageShell.tsx`, `Background.tsx`,
`AssistantPanel.tsx`.

## Auth

| Route | File | Archetype |
|---|---|---|
| `/sign-in`, `/login` | `src/pages/SignIn.tsx` | auth (split-screen) |
| `/get-started` (signup) | `src/pages/GetStarted.tsx` | auth (split-screen) |
| `/forgot-password` | `src/pages/ForgotPassword.tsx` | auth (centered minimal) |
| `/reset-password` | `src/pages/ResetPassword.tsx` | auth (centered minimal) |

## Tenant payment portal (chrome: `PaymentLayout`)

| Route | File | Archetype |
|---|---|---|
| `/p/:token` | `src/pages/pay/TenantBalance.tsx` | detail-record-view (transactional variant) |
| `/p/:token/success` | `src/pages/pay/PaymentSuccess.tsx` | empty-state-shaped confirmation (see auth archetype's confirmation-state note) |
| — | `src/pages/pay/PaymentFailed.tsx` | error-404 (failure variant) |
| `/p/:token/statements` | `src/pages/pay/AllStatements.tsx` | list-table-view (narrow/portal variant) |
| `/p/:token/documents` | `src/pages/pay/PortalDocuments.tsx` | list-table-view (narrow/portal variant) |
| — | `src/pages/pay/MobileMoneyPayment.tsx` | create-edit-form (single-step payment form) |

Shared portal components: `PortalHeader.tsx`, `PortalFooter.tsx`,
`PortalMaintenanceSection.tsx`, `RentStatement.tsx`, `Skeleton.tsx`, `Spinner.tsx`.

## Landlord dashboard (chrome: `DashboardLayout`)

| Route | File | Archetype |
|---|---|---|
| `/dashboard` | `src/landlord/pages/Dashboard.tsx` | dashboard-overview |
| `/rent` | `src/landlord/pages/Rent.tsx` | list-table-view |
| `/tenants` | `src/landlord/pages/Tenants.tsx` | list-table-view |
| `/tenants/new`, `/tenants/:code/edit` | `src/landlord/pages/AddTenant.tsx` | create-edit-form |
| `/tenants/:code` | `src/landlord/pages/TenantProfile.tsx` | detail-record-view |
| `/rooms` | `src/landlord/pages/Rooms.tsx` | list-table-view (grid-board variant) |
| `/maintenance` | `src/landlord/pages/Maintenance.tsx` | list-table-view |
| `/expense-tracker` (+ legacy `/accounting`, `/expenses` redirects) | `src/landlord/pages/Accounting.tsx` | list-table-view |
| `/online-payments` (+ legacy `/accounting/payouts` redirect) | `src/landlord/pages/Payouts.tsx` | list-table-view (+ stepper flow) |
| `/reports/arrears-delinquency` | `src/landlord/pages/reports/ArrearsDelinquency.tsx` | detail-record-view (report variant) |
| `/reports/income-expenses` (+ `/reports` redirect) | `src/landlord/pages/reports/IncomeExpenses.tsx` | detail-record-view (report variant) |
| `/reports/occupancy-rate` | `src/landlord/pages/reports/OccupancyRate.tsx` | detail-record-view (report variant) |
| `/settings`, `/settings/:section` | `src/landlord/pages/Settings.tsx` | settings-account |

### MVP-disabled (routes commented out in App.tsx; migrate lower priority)

| File | Archetype |
|---|---|
| `src/landlord/pages/StaffEmployees.tsx` | list-table-view |
| `src/landlord/pages/StaffPayroll.tsx` | list-table-view (+ detail slide-over) |
| `src/landlord/pages/StaffClock.tsx` | list-table-view (+ create-edit-form modal) |
| `src/landlord/pages/reports/BedRentRoll.tsx` | detail-record-view (report variant) |
| `src/landlord/pages/reports/OwnerPayoutStatement.tsx` | detail-record-view (report variant) |
| `src/landlord/pages/reports/PayrollSummary.tsx` | detail-record-view (report variant) |

Shared dashboard chrome/components (migrate as part of the chrome pass, not
per-page): `DashboardLayout.tsx`, `Sidebar.tsx`, `Header.tsx`,
`MobileBottomNav.tsx`, `GlobalSearch.tsx`, `NotificationsPanel.tsx`,
`ThemeSwitcher.tsx`, `SyncStatus.tsx`, `SyncToast.tsx`.

Shared dashboard component library (used across many pages — migrate once,
centrally, rather than per-page, since every list/detail/form page depends on
them): `Button.tsx`, `Modal.tsx`, `SlideOver.tsx`, `Select.tsx`, `DatePicker.tsx`,
`Pagination.tsx`, `MetricCard.tsx`, `PageHeader.tsx`, `SectionLabel.tsx`,
`FieldLabel.tsx`, `Avatar.tsx`, `Skeleton.tsx`, `BankSelect.tsx`,
`PhoneNumberInput.tsx`, and the various modal/drawer components (`AdjustmentModal`,
`ConfirmDeleteTenantModal`, `ExpenseFormDrawer`, `GenerateInvoicesOverlay`,
`LogPaymentModal`, `MoveOutModal`, `PayoutDetailDrawer`, `ReactivateTenantModal`,
`ReserveRoomModal`, `SyncReviewModal`, `TenantPaymentDrawer`, `TenantSearchDrawer`,
`WaivePenaltyModal`, `AddRoomTypeDrawer`).

**Recommendation for Phase 4 sequencing:** migrate the shared dashboard component
library and `DashboardLayout`/`Sidebar` chrome *first*, as their own batch, since
every landlord page composes from them — migrating pages before their shared
components exist in token-compliant form would mean redoing work.
