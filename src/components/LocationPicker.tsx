import { useEffect, useRef, useState } from "react";
import { Crosshair } from "@phosphor-icons/react";
import PlaceSearch from "./PlaceSearch";

const TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? "";
const LUSAKA: [number, number] = [28.2833, -15.4167];

export type Location = { address: string; lat: number | null; lng: number | null };

async function reverse(lat: number, lng: number): Promise<string | null> {
  try {
    // Street-level results only. Without `types`, a tap in a less-mapped area came back as just the
    // city ("Lusaka, Lusaka, Zambia") and overwrote the address the landlord had typed or picked.
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=address,street,neighborhood&limit=1&access_token=${TOKEN}`,
    );
    const json = await res.json();
    const p = json.features?.[0]?.properties;
    return p ? p.full_address || [p.name, p.place_formatted].filter(Boolean).join(", ") : null;
  } catch {
    return null;
  }
}

/** Address search plus a live map: the pin follows the picked suggestion, and can be dragged, tapped
 * into place, or set from the device's location. Moving the pin re-reads the address. */
export default function LocationPicker({
  value,
  onChange,
  inputClassName,
  id,
}: {
  value: Location;
  onChange: (v: Location) => void;
  inputClassName: string;
  id?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markerRef = useRef<import("mapbox-gl").Marker | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const moveTo = async (lat: number, lng: number, readAddress: boolean, replaceAddress = false) => {
    onChangeRef.current({ address: valueRef.current.address, lat, lng });
    // Only fill the address from the map when there isn't one yet. Once the landlord has typed or
    // picked an address, moving the pin just fine-tunes the location and keeps their wording.
    if (readAddress && (replaceAddress || !valueRef.current.address.trim())) {
      const a = await reverse(lat, lng);
      if (a) onChangeRef.current({ address: a, lat, lng });
    }
  };

  useEffect(() => {
    if (!TOKEN || !el.current) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (cancelled || !el.current) return;
      mapboxgl.accessToken = TOKEN;
      const v = valueRef.current;
      const has = v.lat != null && v.lng != null;
      const map = new mapboxgl.Map({
        container: el.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: has ? [v.lng!, v.lat!] : LUSAKA,
        zoom: has ? 16 : 11,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      const marker = new mapboxgl.Marker({ draggable: true, color: "#1e3a8a" });
      if (has) marker.setLngLat([v.lng!, v.lat!]).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        void moveTo(p.lat, p.lng, true);
      });
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat).addTo(map);
        void moveTo(e.lngLat.lat, e.lngLat.lng, true);
      });
      mapRef.current = map;
      markerRef.current = marker;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in step with values chosen from the search box.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || value.lat == null || value.lng == null) return;
    const cur = marker.getLngLat();
    if (Math.abs(cur.lat - value.lat) < 1e-7 && Math.abs(cur.lng - value.lng) < 1e-7 && marker.getElement().isConnected) return;
    marker.setLngLat([value.lng, value.lat]).addTo(map);
    map.flyTo({ center: [value.lng, value.lat], zoom: 16 });
  }, [value.lat, value.lng]);

  const locate = () => {
    if (!navigator.geolocation) return setNote("Your browser can't share its location.");
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        markerRef.current?.setLngLat([lng, lat]);
        if (mapRef.current && markerRef.current && !markerRef.current.getElement().isConnected) markerRef.current.addTo(mapRef.current);
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 17 });
        await moveTo(lat, lng, true, true);
      },
      () => {
        setLocating(false);
        setNote("Couldn't get your location. Allow location access, or search instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <PlaceSearch
        id={id}
        value={value.address}
        onChange={(address) => onChange({ ...value, address })}
        onPick={(address, lat, lng) => onChange({ address, lat: lat ?? null, lng: lng ?? null })}
        className={inputClassName}
        placeholder="Search street or area, e.g. Kabulonga"
      />
      {TOKEN && (
        <>
          <div className="relative overflow-hidden rounded-md border border-line">
            <div ref={el} className="h-[180px] w-full" />
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink shadow hover:bg-mist"
            >
              <Crosshair size={14} /> {locating ? "Locating…" : "Use my location"}
            </button>
          </div>
          <p className="text-[11px] text-muted">{note ?? "Drag the pin, or tap the map, to fine-tune the exact spot."}</p>
        </>
      )}
    </div>
  );
}
