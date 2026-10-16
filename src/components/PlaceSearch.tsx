import { useEffect, useRef, useState } from "react";
import { MapPin } from "@phosphor-icons/react";

const TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? "";

type Suggestion = { id: string; name: string; full: string; lat?: number; lng?: number };

/** Address field with Mapbox suggestions (Zambia only). Tapping a suggestion fills in the properly
 * formatted address. Informal areas Mapbox doesn't know can still be kept via "Use what I typed".
 * Without a token it quietly behaves like a plain input. */
export default function PlaceSearch({
  value,
  onChange,
  placeholder = "Start typing the street or area",
  className = "",
  id,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  onPick?: (address: string, lat?: number, lng?: number) => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TOKEN || !open || value.trim().length < 3 || value === picked) {
      setItems([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(value)}&country=zm&autocomplete=true&limit=5&access_token=${TOKEN}`;
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) {
          console.warn("Mapbox search failed", res.status);
          setProblem(res.status === 401 || res.status === 403 ? "Mapbox rejected the token (check its URL restrictions)." : `Suggestions unavailable (${res.status}).`);
          return;
        }
        setProblem(null);
        const json = await res.json();
        setItems(
          (json.features ?? []).map((f: { id: string; geometry?: { coordinates: [number, number] }; properties: { name: string; full_address?: string; place_formatted?: string } }) => ({
            id: f.id,
            name: f.properties.name,
            full: f.properties.full_address || [f.properties.name, f.properties.place_formatted].filter(Boolean).join(", "),
            lng: f.geometry?.coordinates[0],
            lat: f.geometry?.coordinates[1],
          })),
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") setProblem("Couldn't reach the map service.");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [value, open, picked]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (v: string, lat?: number, lng?: number) => {
    setPicked(v);
    onChange(v);
    onPick?.(v, lat, lng);
    setOpen(false);
  };

  const showList = open && TOKEN && value.trim().length >= 3 && value !== picked;

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {showList && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line bg-paper shadow-lg">
          {problem && <p className="px-3 py-2 text-[12px] text-amber-700">{problem}</p>}
          {!problem && items.length === 0 && <p className="px-3 py-2 text-[12px] text-muted">Searching…</p>}
          {items.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => choose(s.full, s.lat, s.lng)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-mist"
            >
              <MapPin size={15} className="mt-0.5 shrink-0 text-muted" />
              <span className="min-w-0 text-[13px] leading-snug">
                <span className="block truncate font-medium text-ink">{s.name}</span>
                <span className="block truncate text-[12px] text-muted">{s.full}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => choose(value.trim())}
            className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-[12px] text-muted hover:bg-mist"
          >
            Use "{value.trim()}" as typed
          </button>
        </div>
      )}
    </div>
  );
}
