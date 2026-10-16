import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./landlord/AuthContext";
import RequireAuth from "./landlord/components/RequireAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingScreen from "./components/LoadingScreen";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import GetStarted from "./pages/GetStarted";
import NotFound from "./pages/NotFound";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Pricing from "./pages/Pricing";
import HowItWorks from "./pages/HowItWorks";
import FeatureDetail from "./pages/FeatureDetail";
import About from "./pages/About";
import Careers from "./pages/Careers";
import Contact from "./pages/Contact";
import Docs from "./pages/Docs";
import Status from "./pages/Status";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const PortalLayout = lazy(() => import("./pages/portal/PortalLayout"));
const PortalHome = lazy(() => import("./pages/portal/PortalHome"));
const PortalCheckout = lazy(() => import("./pages/portal/PortalCheckout"));
const PortalSuccess = lazy(() => import("./pages/portal/PortalSuccess"));
const PortalFailed = lazy(() => import("./pages/portal/PortalFailed"));
const PortalHistory = lazy(() => import("./pages/portal/PortalHistory"));
const PortalMaintenance = lazy(() => import("./pages/portal/PortalMaintenance"));
const PortalDocuments = lazy(() => import("./pages/portal/PortalDocuments"));
const PortalPaymentDetail = lazy(() => import("./pages/portal/PortalPaymentDetail"));
const SubscriptionPay = lazy(() => import("./pages/portal/SubscriptionPay"));
const ReportLink = lazy(() => import("./pages/portal/ReportLink"));

const DashboardLayout = lazy(() => import("./landlord/components/DashboardLayout"));
const Dashboard = lazy(() => import("./landlord/pages/Dashboard"));
const Tasks = lazy(() => import("./landlord/pages/Tasks"));
const NotificationsPage = lazy(() => import("./landlord/pages/Notifications"));
const Rent = lazy(() => import("./landlord/pages/Rent"));
const Tenants = lazy(() => import("./landlord/pages/Tenants"));
const AddTenant = lazy(() => import("./landlord/pages/AddTenant"));
const TenantProfile = lazy(() => import("./landlord/pages/TenantProfile"));
const Rooms = lazy(() => import("./landlord/pages/Rooms"));
const Maintenance = lazy(() => import("./landlord/pages/Maintenance"));
const Accounting = lazy(() => import("./landlord/pages/Accounting"));
const Payouts = lazy(() => import("./landlord/pages/Payouts"));
const Billing = lazy(() => import("./landlord/pages/Billing"));
// MVP: staff/payroll is out of scope for now — commented out, not deleted, so it's a quick
// re-enable later. Matching nav entries are commented out in Sidebar.tsx.
// import StaffEmployees from "./landlord/pages/StaffEmployees";
// import StaffPayroll from "./landlord/pages/StaffPayroll";
// import StaffClock from "./landlord/pages/StaffClock";
// MVP: keeping only Income vs expenses, Overdue rent (Arrears/Delinquency), and Occupancy rate —
// the rest are commented out, not deleted. Matching nav entries are commented out in Sidebar.tsx.
// import BedRentRoll from "./landlord/pages/reports/BedRentRoll";
const ArrearsDelinquency = lazy(() => import("./landlord/pages/reports/ArrearsDelinquency"));
// import OwnerPayoutStatement from "./landlord/pages/reports/OwnerPayoutStatement";
const IncomeExpenses = lazy(() => import("./landlord/pages/reports/IncomeExpenses"));
// import PayrollSummary from "./landlord/pages/reports/PayrollSummary";
const OccupancyRate = lazy(() => import("./landlord/pages/reports/OccupancyRate"));
const Settings = lazy(() => import("./landlord/pages/Settings"));
const ActivityLog = lazy(() => import("./landlord/pages/ActivityLog"));
const HelpSupport = lazy(() => import("./landlord/pages/HelpSupport"));
const HelpDocs = lazy(() => import("./landlord/pages/HelpDocs"));
const Reports = lazy(() => import("./landlord/pages/Reports"));
const ReportGenerate = lazy(() => import("./landlord/pages/ReportGenerate"));

// ScrollToTop component for paramore between pages
function RoutesBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <RoutesBoundary>
        {/* Dashboard and tenant-portal pages are code-split (lazy imports above); the first visit
            to one suspends here until its chunk downloads. Public pages are bundled eagerly and
            never hit this. */}
        <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/get-started" element={<GetStarted />} />
          <Route path="/login" element={<SignIn />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/features/:slug" element={<FeatureDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/status" element={<Status />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          <Route element={<PortalLayout />}>
            <Route path="/p/:token" element={<PortalHome />} />
            <Route path="/p/:token/pay" element={<PortalCheckout />} />
            <Route path="/p/:token/success" element={<PortalSuccess />} />
            <Route path="/p/:token/failed" element={<PortalFailed />} />
            <Route path="/p/:token/history" element={<PortalHistory />} />
            <Route path="/p/:token/history/:entryKey" element={<PortalPaymentDetail />} />
            <Route path="/p/:token/maintenance" element={<PortalMaintenance />} />
            <Route path="/p/:token/documents" element={<PortalDocuments />} />
            {/* The history page used to live at /statements — tenants bookmark and re-share these
                links, so the old path redirects rather than 404s. */}
            <Route path="/p/:token/statements" element={<Navigate to="../history" replace relative="path" />} />
          </Route>

          {/* The landlord's own IPM subscription payment link, sent by the subscription-due SMS,
              deliberately outside the /p/:token group above (that's the tenant-rent portal, a
              different payer and token scheme entirely) and outside RequireAuth below: the token
              in the URL is the whole trust boundary, same reasoning as the tenant portal. */}
          <Route path="/subscription/:token" element={<SubscriptionPay />} />

          {/* The auto-generated "all tenants paid" income vs expenses summary, sent by the 100%
              milestone (see send-notification-digests/index.ts). Same trust-boundary reasoning as
              /subscription/:token above, no dashboard sign-in, no payment step on this page. */}
          <Route path="/report/:token" element={<ReportLink />} />

          <Route element={<RequireAuth />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/rent" element={<Rent />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/tenants/new" element={<AddTenant />} />
              <Route path="/tenants/:code/edit" element={<AddTenant />} />
              <Route path="/tenants/:code" element={<TenantProfile />} />
              <Route path="/rooms" element={<Rooms />} />
              <Route path="/maintenance" element={<Maintenance />} />
              <Route path="/expense-tracker" element={<Accounting />} />
              <Route path="/online-payments" element={<Payouts />} />
              <Route path="/online-payments/transfer" element={<Payouts />} />
              <Route path="/billing" element={<Billing />} />
              {/* Old paths — "Accounting" was renamed to "Expense Tracker" — kept as redirects so any
                  existing bookmarks/links still land somewhere. */}
              <Route path="/accounting" element={<Navigate to="/expense-tracker" replace />} />
              <Route path="/accounting/payouts" element={<Navigate to="/online-payments" replace />} />
              <Route path="/expenses" element={<Navigate to="/expense-tracker" replace />} />
              {/* MVP: staff/payroll — see the note by the imports above. */}
              {/* <Route path="/staff" element={<Navigate to="/staff/employees" replace />} /> */}
              {/* <Route path="/staff/employees" element={<StaffEmployees />} /> */}
              {/* <Route path="/staff/payroll" element={<StaffPayroll />} /> */}
              {/* <Route path="/staff/clock" element={<StaffClock />} /> */}
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/:slug/generate" element={<ReportGenerate />} />
              {/* <Route path="/reports/bed-rent-roll" element={<BedRentRoll />} /> */}
              <Route path="/reports/arrears-delinquency" element={<ArrearsDelinquency />} />
              {/* <Route path="/reports/owner-payout-statement" element={<OwnerPayoutStatement />} /> */}
              <Route path="/reports/income-expenses" element={<IncomeExpenses />} />
              {/* <Route path="/reports/payroll-summary" element={<PayrollSummary />} /> */}
              <Route path="/reports/occupancy-rate" element={<OccupancyRate />} />
              <Route path="/settings/:section?" element={<Settings />} />
              <Route path="/activity-log" element={<ActivityLog />} />
            </Route>

            {/* Help & Support deliberately sits outside DashboardLayout: it's a docs-style reading
                page (its own left nav, its own "on this page" column), not another dashboard
                screen, so it shouldn't carry the dashboard's sidebar/header chrome on top of its
                own navigation. Still behind RequireAuth -- only signed-in landlords reach it. */}
            <Route path="/help" element={<HelpSupport />} />
            <Route path="/help/:group" element={<HelpDocs />} />
            <Route path="/help/:group/:article" element={<HelpDocs />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </RoutesBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
