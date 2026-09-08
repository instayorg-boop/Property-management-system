import { useMemo, useRef, useState } from "react";
import { Bank as BankIcon, CaretDown } from "@phosphor-icons/react";
import type { Bank } from "../../lib/payoutApi";

function BankLogo({ bank }: { bank: Bank }) {
  if (bank.logo_url) {
    return <img src={bank.logo_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain" />;
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mist text-muted">
      <BankIcon size={12} weight="duotone" />
    </span>
  );
}

/** Searchable bank picker, sourced from the local `banks` cache — same pattern as TenantFormDrawer's
 * RoomPicker (button trigger + absolute panel + blur-timeout search input + mousedown-select rows). */
export default function BankSelect({
  banks,
  selectedCode,
  onSelect,
  placeholder = "Select your bank",
}: {
  banks: Bank[];
  selectedCode: string | null;
  onSelect: (bank: Bank) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<number | null>(null);

  const selected = banks.find((b) => b.code === selectedCode) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter((b) => b.name.toLowerCase().includes(q));
  }, [banks, query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2.5 text-left text-sm outline-none focus:border-brand"
      >
        <span className={`flex items-center gap-2 ${selected ? "text-ink" : "text-muted"}`}>
          {selected && <BankLogo bank={selected} />}
          {selected ? selected.name : placeholder}
        </span>
        <CaretDown size={14} weight="bold" className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-paper shadow-card">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                blurTimeout.current = window.setTimeout(() => setOpen(false), 120);
              }}
              onFocus={() => {
                if (blurTimeout.current) window.clearTimeout(blurTimeout.current);
              }}
              placeholder="Search banks"
              className="w-full rounded-md bg-mist px-2.5 py-1.5 text-sm outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {results.map((b) => (
              <button
                key={b.code}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(b);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-mist"
              >
                <BankLogo bank={b} />
                {b.name}
              </button>
            ))}
            {results.length === 0 && <p className="px-3 py-3 text-sm text-muted">No banks match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
