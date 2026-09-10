import { useState } from "react";
import SlideOver from "./SlideOver";
import Button from "./Button";
import FieldLabel, { FieldError } from "./FieldLabel";
import type { RoomTypeConfig } from "../RoomsContext";
import type { DepositRefundability } from "../TenantsContext";

const refundabilityOptions: DepositRefundability[] = [
  "Refundable",
  "Partially refundable",
  "Non-refundable",
];

export default function AddRoomTypeDrawer({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (config: Omit<RoomTypeConfig, "id">, roomCount: number) => void;
}) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [rent, setRent] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositRefundability, setDepositRefundability] =
    useState<DepositRefundability>("Refundable");
  const [roomCount, setRoomCount] = useState(1);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const canSave =
    name.trim().length > 0 && capacity > 0 && rent > 0 && roomCount > 0;

  const trySave = () => {
    if (!canSave) {
      setSubmitAttempted(true);
      return;
    }
    onSave(
      {
        name: name.trim(),
        capacity,
        rent,
        depositAmount,
        depositRefundability,
      },
      roomCount,
    );
  };

  return (
    <SlideOver
      onClose={onClose}
      title="Add room type"
      description="Set the rent and deposit terms once — every room of this type uses them."
      footer={
        <Button variant="primary" onClick={trySave} className="w-full py-3">
          Add room type
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {submitAttempted && !canSave && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 sm:col-span-2">
            A few required fields still need attention — they're marked below.
          </div>
        )}

        <div className="sm:col-span-2">
          <FieldLabel required>Name</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Studio, Ensuite"
            className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-brand ${
              submitAttempted && !name.trim() ? "border-red-400" : "border-line"
            }`}
          />
          {submitAttempted && !name.trim() && (
            <FieldError>Name is required.</FieldError>
          )}
        </div>
        <div>
          <FieldLabel required>Beds per room</FieldLabel>
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) =>
              setCapacity(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <FieldLabel required>Rooms to add</FieldLabel>
          <input
            type="number"
            min={1}
            value={roomCount}
            onChange={(e) =>
              setRoomCount(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <FieldLabel required>Rent (K/month)</FieldLabel>
          <input
            type="number"
            min={0}
            value={rent}
            onChange={(e) => setRent(Number(e.target.value) || 0)}
            className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-brand ${
              submitAttempted && rent <= 0 ? "border-red-400" : "border-line"
            }`}
          />
          {submitAttempted && rent <= 0 && (
            <FieldError>Enter a rent amount greater than zero.</FieldError>
          )}
        </div>
        <div>
          <FieldLabel>Deposit (K)</FieldLabel>
          <input
            type="number"
            min={0}
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>Deposit terms</FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {refundabilityOptions.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setDepositRefundability(o)}
                className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${
                  depositRefundability === o
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line text-muted hover:bg-mist"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SlideOver>
  );
}
