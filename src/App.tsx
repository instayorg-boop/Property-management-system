import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./landlord/AuthContext";
import RequireAuth from "./landlord/components/RequireAuth";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Pricing from "./pages/Pricing";
import HowItWorks from "./pages/HowItWorks";
import FeatureDetail from "./pages/FeatureDetail";
import About from "./pages/About";
import Careers from "./pages/Careers";
import Contact from "./pages/Contact";
import Help from "./pages/Help";
import Docs from "./pages/Docs";
import Status from "./pages/Status";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

import PortalLayout from "./pages/portal/PortalLayout";
import PortalHome from "./pages/portal/PortalHome";
import PortalCheckout from "./pages/portal/PortalCheckout";
import PortalSuccess from "./pages/portal/PortalSuccess";
import PortalFailed from "./pages/portal/PortalFailed";
import PortalHistory from "./pages/portal/PortalHistory";
import PortalMaintenance from "./pages/portal/PortalMaintenance";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalPaymentDetail from "./pages/portal/PortalPaymentDetail";

import DashboardLayout from "./landlord/components/DashboardLayout";
import Dashboard from "./landlord/pages/Dashboard";
import Tasks from "./landlord/pages/Tasks";
import NotificationsPage from "./landlord/pages/Notifications";
import Rent from "./landlord/pages/Rent";
import Tenants from "./landlord/pages/Tenants";
import AddTenant from "./landlord/pages/AddTenant";
import TenantProfile from "./landlord/pages/TenantProfile";
import Rooms from "./landlord/pages/Rooms";
import Maintenance from "./landlord/pages/Maintenance";
import Accounting from "./landlord/pages/Accounting";
import Payouts from "./landlord/pages/Payouts";
// MVP: staff/payroll is out of scope for now — commented out, not deleted, so it's a quick
// re-enable later. Matching nav entries are commented out in Sidebar.tsx.
// import StaffEmployees from "./landlord/pages/StaffEmployees";
// import StaffPayroll from "./landlord/pages/StaffPayroll";
// import StaffClock from "./landlord/pages/StaffClock";
// MVP: keeping only Income vs expenses, Overdue rent (Arrears/Delinquency), and Occupancy rate —
// the rest are commented out, not deleted. Matching nav entries are commented out in Sidebar.tsx.
// import BedRentRoll from "./landlord/pages/reports/BedRentRoll";
import ArrearsDelinquency from "./landlord/pages/reports/ArrearsDelinquency";
// import OwnerPayoutStatement from "./landlord/pages/reports/OwnerPayoutStatement";
import IncomeExpenses from "./landlord/pages/reports/IncomeExpenses";
// import PayrollSummary from "./landlord/pages/reports/PayrollSummary";
import OccupancyRate from "./landlord/pages/reports/OccupancyRate";
import Settings from "./landlord/pages/Settings";
import Reports from "./landlord/pages/Reports";
import ReportGenerate from "./landlord/pages/ReportGenerate";
import { useEffect } from "react";

// ScrollToTop component for paramore between pages
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
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/login" element={<SignIn />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/features/:slug" element={<FeatureDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/help" element={<Help />} />
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
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/:section" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
