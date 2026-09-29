import { useMemo, useRef, useState } from "react";
import { Landmark, ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { Bank } from "../../lib/payoutApi";

function BankLogo({ bank }: { bank: Bank }) {
  if (bank.logo_url) {
    return <img src={bank.logo_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain" />;
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
      <Landmark className="size-3" />
    </span>
  );
}

/** Searchable bank picker, sourced from the local `banks` cache — built on shadcn's `Popover` +
 * `Input`, same trigger/search/list interaction pattern as before (button trigger + panel + search
 * input + click-to-select rows), now token-compliant. */
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
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm outline-none focus:border-primary"
        >
          <span className={cn("flex items-center gap-2", selected ? "text-foreground" : "text-muted-foreground")}>
            {selected && <BankLogo bank={selected} />}
            {selected ? selected.name : placeholder}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] overflow-hidden rounded-md border-border bg-card p-0 shadow-md">
        <div className="border-b border-border p-2">
          <Input
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
            className="h-8 bg-surface-muted"
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
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
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
            >
              <BankLogo bank={b} />
              {b.name}
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">No banks match "{query}".</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
