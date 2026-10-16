import { MagnifyingGlass } from "@phosphor-icons/react";

/** Shared toolbar search box: 16px icon at left-3, rounded-lg, py-2 pl-9, 13px. Use on every list page. */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative flex min-w-[220px] items-center ${className}`}>
      <MagnifyingGlass size={16} weight="bold" className="pointer-events-none absolute left-3 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-paper py-2 pl-9 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-brand"
      />
    </div>
  );
}
