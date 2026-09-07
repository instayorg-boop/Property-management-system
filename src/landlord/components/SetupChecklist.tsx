import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Circle, X, DoorOpen, UsersThree, Bank, IdentificationBadge } from "@phosphor-icons/react";
import { useRooms } from "../RoomsContext";
import { useTenants } from "../TenantsContext";
import { useSettings } from "../SettingsContext";

function storageKey(propertyId: string) {
  return `instay-setup-dismissed-${propertyId}`;
}

/** A lightweight "what's left to configure" card for the dashboard — replaces a forced onboarding
 * wizard with a checklist the landlord can act on (or ignore) at their own pace. Each item reflects
 * real state, so it can never drift out of sync with what's actually been set up. */
export default function SetupChecklist() {
  const navigate = useNavigate();
  const { roomTypeConfigs } = useRooms();
  const { tenants } = useTenants();
  const { propertyId, landlordName, landlordPhone, lencoConnected, bankName } = useSettings();
  const [dismissed, setDismissed] = useState(() => (propertyId ? window.localStorage.getItem(storageKey(propertyId)) === "1" : false));

  const items = useMemo(
    () => [
      {
        key: "rooms",
        label: "Add your room types",
        detail: "Rent, deposit terms, and how many rooms of each.",
        done: roomTypeConfigs.length > 0,
        icon: DoorOpen,
        to: "/rooms",
      },
      {
        key: "tenants",
        label: "Add your tenants",
        detail: "One at a time, or import a spreadsheet.",
        done: tenants.length > 0,
        icon: UsersThree,
        to: "/tenants",
      },
      {
        key: "contact",
        label: "Add your contact details",
        detail: "Shown to tenants on invoices and the payment page.",
        done: Boolean(landlordName.trim() && landlordPhone.trim()),
        icon: IdentificationBadge,
        to: "/settings/property",
      },
      {
        key: "payout",
        label: "Connect a payout account",
        detail: "So collected rent can actually reach you.",
        done: lencoConnected || Boolean(bankName.trim()),
        icon: Bank,
        to: "/settings/online-payments",
      },
    ],
    [roomTypeConfigs.length, tenants.length, landlordName, landlordPhone, lencoConnected, bankName]
  );

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  if (dismissed || allDone) return null;

  const dismiss = () => {
    setDismissed(true);
    if (propertyId) window.localStorage.setItem(storageKey(propertyId), "1");
  };

  return (
    <div data-tour="setup-checklist" className="rounded-lg border border-line bg-paper p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Finish setting up your property</p>
          <p className="mt-0.5 text-xs text-muted">
            {doneCount} of {items.length} done — everything here can wait, nothing's blocked until you're ready.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss setup checklist"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-mist hover:text-ink"
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-mist">
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.to)}
            className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
              item.done ? "border-line bg-mist/40" : "border-line hover:bg-mist"
            }`}
          >
            {item.done ? (
              <CheckCircle size={20} weight="fill" className="shrink-0 text-emerald-600" />
            ) : (
              <Circle size={20} weight="regular" className="shrink-0 text-muted" />
            )}
            <div className="min-w-0">
              <p className={`text-[13px] font-medium ${item.done ? "text-muted line-through" : "text-ink"}`}>{item.label}</p>
              <p className="truncate text-[11px] text-muted">{item.detail}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
