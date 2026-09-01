import { useTheme } from "../ThemeContext";
import { Monitor as MonitorIcon, Sun as SunIcon, Moon as MoonIcon } from "@phosphor-icons/react";

const options = [
  { id: "system" as const, label: "System", Icon: MonitorIcon },
  { id: "light" as const, label: "Light", Icon: SunIcon },
  { id: "dark" as const, label: "Dark", Icon: MoonIcon },
];

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-paper p-1">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          onClick={() => setTheme(id)}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            theme === id ? "bg-mist text-ink" : "text-muted hover:text-ink"
          }`}
        >
          <Icon size={16} weight="duotone" />
        </button>
      ))}
    </div>
  );
}
