import { Outlet } from "react-router-dom";
import { SettingsProvider } from "../../landlord/SettingsContext";
import { TenantsProvider } from "../../landlord/TenantsContext";
import { MaintenanceProvider } from "../../landlord/MaintenanceContext";

/**
 * Public payment-link surface — no auth, no dashboard chrome. Wraps only the contexts these
 * pages actually need (tenant balances, property name, maintenance reports), reusing the same
 * context code as the dashboard so tenant data and behavior stay consistent, even though this
 * runs as its own provider tree since a real public page won't share the landlord's live session.
 */
export default function PaymentLayout() {
  return (
    <SettingsProvider>
      <TenantsProvider>
        <MaintenanceProvider>
          <div className="min-h-screen bg-mist">
            <Outlet />
          </div>
        </MaintenanceProvider>
      </TenantsProvider>
    </SettingsProvider>
  );
}
