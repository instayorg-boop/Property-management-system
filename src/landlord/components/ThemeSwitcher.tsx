import { useTheme } from "../ThemeContext";

function MonitorIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.5}>
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" />
      <path d="M5.5 14h5M8 11v3" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.5}>
      <circle cx="8" cy="8" r="3" />
      <path
        d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.4 3.6l-1 1M4.6 11.4l-1 1M12.4 12.4l-1-1M4.6 4.6l-1-1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.5}>
      <path d="M13.5 9.5A6 6 0 1 1 6.5 2.5a5 5 0 0 0 7 7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
          <Icon />
        </button>
      ))}
    </div>
  );
}
