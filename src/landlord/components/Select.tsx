import * as RadixSelect from "@radix-ui/react-select";

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={1.75}>
      <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={2}>
      <path d="M3.5 8.2l3 3 6-6.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type SelectOption = { value: string; label: string };

/** Shared dropdown/select control — same visual language everywhere it's used. */
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
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger
        className={`flex items-center gap-2 rounded-lg border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink outline-none data-[placeholder]:text-muted ${className}`}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="ml-auto text-muted">
          <ChevronDownIcon />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[--radix-select-trigger-width] overflow-hidden rounded-lg border border-line bg-paper shadow-card"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center rounded-md py-2 pr-3 pl-8 text-sm text-ink outline-none select-none data-[highlighted]:bg-mist data-[state=checked]:font-medium data-[state=checked]:text-brand"
              >
                <RadixSelect.ItemIndicator className="absolute left-2 flex items-center">
                  <CheckIcon />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
