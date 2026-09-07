import { SettingsProvider } from "../SettingsContext";
import { TenantsProvider } from "../TenantsContext";
import { RoomsProvider } from "../RoomsContext";
import Onboarding from "../pages/Onboarding";

/** Providers the onboarding wizard needs to create the first property, add room types, and
 * bulk-import tenants — the same stack DashboardLayout uses, minus the Sidebar/Topbar chrome
 * (and minus Expenses/Staff/Maintenance/Invoices, which nothing in onboarding touches). */
export default function OnboardingLayout() {
  return (
    <SettingsProvider>
      <TenantsProvider>
        <RoomsProvider>
          <Onboarding />
        </RoomsProvider>
      </TenantsProvider>
    </SettingsProvider>
  );
}
