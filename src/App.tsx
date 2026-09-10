import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./landlord/AuthContext";
import RequireAuth from "./landlord/components/RequireAuth";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import GetStarted from "./pages/GetStarted";
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

import PaymentLayout from "./pages/pay/PaymentLayout";
import SelectTenant from "./pages/pay/SelectTenant";
import TenantBalance from "./pages/pay/TenantBalance";
import PaymentSuccess from "./pages/pay/PaymentSuccess";
import MaintenanceReport from "./pages/pay/MaintenanceReport";

import DashboardLayout from "./landlord/components/DashboardLayout";
import Dashboard from "./landlord/pages/Dashboard";
import Rent from "./landlord/pages/Rent";
import Tenants from "./landlord/pages/Tenants";
import AddTenant from "./landlord/pages/AddTenant";
import TenantProfile from "./landlord/pages/TenantProfile";
import Rooms from "./landlord/pages/Rooms";
import Maintenance from "./landlord/pages/Maintenance";
import Accounting from "./landlord/pages/Accounting";
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/login" element={<SignIn />} />
        <Route path="/get-started" element={<GetStarted />} />
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

        <Route element={<PaymentLayout />}>
          <Route path="/pay/:propertySlug" element={<SelectTenant />} />
          <Route path="/pay/:propertySlug/:tenantId" element={<TenantBalance />} />
          <Route path="/pay/:propertySlug/:tenantId/success" element={<PaymentSuccess />} />
          <Route path="/pay/:propertySlug/:tenantId/report" element={<MaintenanceReport />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/rent" element={<Rent />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/tenants/new" element={<AddTenant />} />
            <Route path="/tenants/:id/edit" element={<AddTenant />} />
            <Route path="/tenants/:id" element={<TenantProfile />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/accounting" element={<Accounting />} />
            <Route path="/expenses" element={<Navigate to="/accounting" replace />} />
            {/* MVP: staff/payroll — see the note by the imports above. */}
            {/* <Route path="/staff" element={<Navigate to="/staff/employees" replace />} /> */}
            {/* <Route path="/staff/employees" element={<StaffEmployees />} /> */}
            {/* <Route path="/staff/payroll" element={<StaffPayroll />} /> */}
            {/* <Route path="/staff/clock" element={<StaffClock />} /> */}
            <Route path="/reports" element={<Navigate to="/reports/income-expenses" replace />} />
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
