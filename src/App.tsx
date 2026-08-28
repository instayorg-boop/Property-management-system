import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import GetStarted from "./pages/GetStarted";
import ForgotPassword from "./pages/ForgotPassword";
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

import DashboardLayout from "./landlord/components/DashboardLayout";
import Dashboard from "./landlord/pages/Dashboard";
import Rent from "./landlord/pages/Rent";
import Tenants from "./landlord/pages/Tenants";
import Rooms from "./landlord/pages/Rooms";
import Maintenance from "./landlord/pages/Maintenance";
import Expenses from "./landlord/pages/Expenses";
import StaffEmployees from "./landlord/pages/StaffEmployees";
import StaffPayroll from "./landlord/pages/StaffPayroll";
import StaffClock from "./landlord/pages/StaffClock";
import BedRentRoll from "./landlord/pages/reports/BedRentRoll";
import ArrearsDelinquency from "./landlord/pages/reports/ArrearsDelinquency";
import OwnerPayoutStatement from "./landlord/pages/reports/OwnerPayoutStatement";
import Settings from "./landlord/pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/login" element={<SignIn />} />
        <Route path="/get-started" element={<GetStarted />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
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

        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/rent" element={<Rent />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/maintenance" element={<Maintenance />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/staff" element={<Navigate to="/staff/employees" replace />} />
          <Route path="/staff/employees" element={<StaffEmployees />} />
          <Route path="/staff/payroll" element={<StaffPayroll />} />
          <Route path="/staff/clock" element={<StaffClock />} />
          <Route path="/reports" element={<Navigate to="/reports/bed-rent-roll" replace />} />
          <Route path="/reports/bed-rent-roll" element={<BedRentRoll />} />
          <Route path="/reports/arrears-delinquency" element={<ArrearsDelinquency />} />
          <Route path="/reports/owner-payout-statement" element={<OwnerPayoutStatement />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
