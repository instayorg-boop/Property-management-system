import { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import DatePicker from "./DatePicker";

function plusDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Pauses autopilot's messages for one tenant until a date ("they promised to pay Friday"). */
export default function AutopilotPauseModal({
  tenantName,
  pausedUntil,
  note,
  onClose,
  onPause,
  onResume,
}: {
  tenantName: string;
  pausedUntil?: string;
  note?: string;
  onClose: () => void;
  onPause: (until: string, note: string) => void;
  onResume: () => void;
}) {
  const [until, setUntil] = useState(pausedUntil || plusDaysISO(3));
  const [text, setText] = useState(note ?? "");
  const isPaused = !!pausedUntil;

  return (
    <Modal
      onClose={onClose}
      title="Pause autopilot"
      description={
        <span>
          Autopilot sends nothing to <strong>{tenantName}</strong> until the date you pick, then carries on where it left off.
        </span>
      }
      footer={
        <div className="flex w-full gap-2">
          {isPaused && (
            <Button variant="secondary" onClick={onResume} className="flex-1 py-3">
              Resume now
            </Button>
          )}
          <Button variant="primary" disabled={!until} onClick={() => onPause(until, text.trim())} className="flex-1 py-3">
            {isPaused ? "Update pause" : "Pause autopilot"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Pause until</label>
          <DatePicker value={until} onChange={setUntil} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Note (optional)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="e.g. Promised to pay on Friday"
            className="w-full resize-none rounded-lg border border-transparent bg-mist px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>
    </Modal>
  );
}
