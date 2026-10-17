import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";
import TeamSettingsCard from "../components/TeamSettingsCard";
import { useAccess } from "../AccessContext";

/** Full page for managing a property's team — reached from the "Team" card on Settings.
 * Not a modal: invite/edit/resend/revoke all happen inline on this page via TeamSettingsCard,
 * which stays unchanged between its former modal placement and this one (plain `space-y-4` root). */
export default function TeamMembers() {
  const navigate = useNavigate();
  const { active } = useAccess();

  return (
    <div className="px-4 pt-5 pb-24 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            aria-label="Back to settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-mist hover:text-ink"
          >
            <ArrowLeft size={16} weight="bold" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-brand">Team</h1>
            <p className="mt-0.5 text-sm text-muted">
              Invite managers and viewers for {active?.property_name ?? "this property"}, and control what each of them can see and do.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 max-w-5xl">
        <TeamSettingsCard />
      </div>
    </div>
  );
}
