import { useState } from "react";
import Modal from "./Modal";
import Button from "./Button";
import DatePicker from "./DatePicker";
import { useVacantRoomsForAssignment } from "../RoomsContext";
import type { DepositMethod, Tenant } from "../TenantsContext";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const METHODS: { value: DepositMethod; label: string }[] = [
  { value: "mobile", label: "Mobile money" },
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
];

/** Holds a specific vacant room for an inactive tenant (e.g. away for the semester break) and logs
 * a non-refundable holding fee against their record — separate from the rent ledger and from
 * reactivating them, which would resume full billing. See TenantProfile's "Reserve a room" action. */
export default function ReserveRoomModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: (details: { room: string; feeAmount: number; feeMethod: DepositMethod; feeDate: string }) => void;
}) {
  const vacantRooms = useVacantRoomsForAssignment();
  const [room, setRoom] = useState(vacantRooms[0]?.room ?? "");
  const [feeAmount, setFeeAmount] = useState(0);
  const [feeMethod, setFeeMethod] = useState<DepositMethod>("mobile");
  const [feeDate, setFeeDate] = useState(todayISO());

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-md"
      title="Reserve a room"
      description={`Holds a room for ${tenant.name} without reactivating them — no rent is charged until you reactivate. The fee below is a separate, non-refundable charge, not counted toward their first month's rent.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!room}
            onClick={() =>
              onConfirm({
                room,
                feeAmount,
                feeMethod,
                feeDate: new Date(feeDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
              })
            }
          >
            Reserve
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Room</label>
          {vacantRooms.length === 0 ? (
            <p className="text-sm text-muted">No vacant rooms right now.</p>
          ) : (
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
            >
              {vacantRooms.map((r) => (
                <option key={r.room} value={r.room}>
                  {r.room} · {r.roomType} · K{r.rent}/month
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Holding fee (K)</label>
          <input
            type="number"
            min={0}
            value={feeAmount || ""}
            onChange={(e) => setFeeAmount(Math.max(0, Number(e.target.value) || 0))}
            placeholder="0"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Payment method</label>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setFeeMethod(m.value)}
                className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                  feeMethod === m.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-mist"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Date collected</label>
          <DatePicker value={feeDate} onChange={setFeeDate} />
        </div>
      </div>
    </Modal>
  );
}
