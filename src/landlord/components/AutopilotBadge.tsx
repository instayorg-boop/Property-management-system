import { Lightning } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "../SettingsContext";

/**
 * Autopilot status badge. Shows whether autopilot is chasing late rent right now, and opens the
 * Autopilot settings on click, so the landlord never has to hunt through Settings to find out.
 */
export default function AutopilotBadge({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { autopilotEnabled } = useSettings();

  return (
    <button
      type="button"
      onClick={() => navigate("/settings/autopilot")}
      title={autopilotEnabled ? "Autopilot is chasing late rent for you. Click to manage." : "Autopilot is off. Click to turn it on."}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors ${
        autopilotEnabled
          ? "bg-brand text-white hover:bg-brand/90"
          : "border border-line bg-mist text-muted hover:text-ink"
      } ${className}`}
    >
      <Lightning size={12} weight="fill" />
      {autopilotEnabled ? "Autopilot on" : "Autopilot off"}
    </button>
  );
}
