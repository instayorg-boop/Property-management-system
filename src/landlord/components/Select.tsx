import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";

export type SelectOption = { value: string; label: string };

/** Shared dropdown/select control — thin wrapper around shadcn's `Select`, same visual language
 * everywhere it's used. Shows a friendly, specific empty state (never "No data") when `options`
 * is empty, since a bare dropdown with nothing in it otherwise looks broken rather than "nothing
 * to pick from yet". */
export default function Select({
  value,
  onChange,
  options,
  placeholder = "Select",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <ShadcnSelect value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full rounded-md border-border bg-card text-sm font-medium", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nothing to choose from yet.</p>
        ) : (
          options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </ShadcnSelect>
  );
}
