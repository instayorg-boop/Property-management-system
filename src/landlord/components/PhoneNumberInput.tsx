import { useMemo, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";

/** Dial code + a practical (not perfect) digit-count range for the local number, enough to catch
 * "that's obviously not a real phone number" without re-implementing the E.164 spec. Zambia leads
 * the list since this is a Zambia-based property system — landlords' own tenants are overwhelmingly
 * local, with international numbers the exception this exists to support. */
const COUNTRIES = [
  {
    code: "ZM",
    name: "Zambia",
    dial: "260",
    flag: "🇿🇲",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "ZA",
    name: "South Africa",
    dial: "27",
    flag: "🇿🇦",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "ZW",
    name: "Zimbabwe",
    dial: "263",
    flag: "🇿🇼",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "MW",
    name: "Malawi",
    dial: "265",
    flag: "🇲🇼",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "TZ",
    name: "Tanzania",
    dial: "255",
    flag: "🇹🇿",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "KE",
    name: "Kenya",
    dial: "254",
    flag: "🇰🇪",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "MZ",
    name: "Mozambique",
    dial: "258",
    flag: "🇲🇿",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "BW",
    name: "Botswana",
    dial: "267",
    flag: "🇧🇼",
    minDigits: 7,
    maxDigits: 8,
  },
  {
    code: "NA",
    name: "Namibia",
    dial: "264",
    flag: "🇳🇦",
    minDigits: 7,
    maxDigits: 9,
  },
  {
    code: "CD",
    name: "DR Congo",
    dial: "243",
    flag: "🇨🇩",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "UG",
    name: "Uganda",
    dial: "256",
    flag: "🇺🇬",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "NG",
    name: "Nigeria",
    dial: "234",
    flag: "🇳🇬",
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: "GH",
    name: "Ghana",
    dial: "233",
    flag: "🇬🇭",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "GB",
    name: "United Kingdom",
    dial: "44",
    flag: "🇬🇧",
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: "US",
    name: "United States",
    dial: "1",
    flag: "🇺🇸",
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: "CA",
    name: "Canada",
    dial: "1",
    flag: "🇨🇦",
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: "IN",
    name: "India",
    dial: "91",
    flag: "🇮🇳",
    minDigits: 10,
    maxDigits: 10,
  },
  {
    code: "CN",
    name: "China",
    dial: "86",
    flag: "🇨🇳",
    minDigits: 11,
    maxDigits: 11,
  },
  {
    code: "AE",
    name: "UAE",
    dial: "971",
    flag: "🇦🇪",
    minDigits: 9,
    maxDigits: 9,
  },
  {
    code: "AU",
    name: "Australia",
    dial: "61",
    flag: "🇦🇺",
    minDigits: 9,
    maxDigits: 9,
  },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const DEFAULT_COUNTRY: CountryCode = "ZM";

/** Splits a stored phone string back into (country, local digits) for editing — anything already
 * saved as "+260977123456" or "+260 977 123 456" resolves to Zambia + "977123456"; anything without
 * a recognizable "+<dial>" prefix (the vast majority of what's in the database today, entered before
 * this component existed) is treated as a bare local number under the default country. */
export function parsePhone(value: string): {
  country: CountryCode;
  local: string;
} {
  const digitsOnly = value.replace(/[^\d+]/g, "");
  if (digitsOnly.startsWith("+")) {
    const withoutPlus = digitsOnly.slice(1);
    const match = COUNTRIES.filter((c) => withoutPlus.startsWith(c.dial)).sort(
      (a, b) => b.dial.length - a.dial.length,
    )[0];
    if (match) {
      return {
        country: match.code,
        local: withoutPlus.slice(match.dial.length),
      };
    }
  }
  return { country: DEFAULT_COUNTRY, local: value.replace(/[^\d]/g, "") };
}

/** Combines a country + local digits back into the one string form stored everywhere else in the
 * app (`+<dial><local>`, no separators — the same format tel:/wa.me links already expect). A local
 * number typed with a leading 0 (the usual way people say their own number out loud) has it
 * stripped, since that 0 is implied by the country code once one's attached. */
export function formatPhone(country: CountryCode, local: string): string {
  const digits = local.replace(/[^\d]/g, "").replace(/^0+/, "");
  const dial =
    COUNTRY_BY_CODE.get(country)?.dial ??
    COUNTRY_BY_CODE.get(DEFAULT_COUNTRY)!.dial;
  return digits ? `+${dial}${digits}` : "";
}

export function validatePhone(value: string): string | null {
  if (!value.trim()) return null; // emptiness is a required-field concern, not a format one
  const { country, local } = parsePhone(value);
  const digits = local.replace(/^0+/, "");
  const meta = COUNTRY_BY_CODE.get(country)!;
  if (digits.length < meta.minDigits || digits.length > meta.maxDigits) {
    return meta.minDigits === meta.maxDigits
      ? `${meta.name} numbers are ${meta.minDigits} digits after the country code.`
      : `${meta.name} numbers are ${meta.minDigits}–${meta.maxDigits} digits after the country code.`;
  }
  return null;
}

/** A phone field with its own country-code picker — the composed value (what onChange receives)
 * is always the full "+<dial><digits>" string, regardless of which country's flag is showing. */
export default function PhoneNumberInput({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
}) {
  const parsed = useMemo(() => parsePhone(value), [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blurTimeout = useRef<number | null>(null);
  const country = COUNTRY_BY_CODE.get(parsed.country)!;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q),
    );
  }, [query]);

  const setCountry = (code: CountryCode) => {
    onChange(formatPhone(code, parsed.local));
    setQuery("");
    setOpen(false);
  };

  return (
    <div>
      <div
        className={`flex items-stretch rounded-lg border ${error ? "border-red-400" : "border-line"} focus-within:border-brand focus-within:ring-1 focus-within:ring-brand`}
      >
        <div className="relative shrink-0 border-r border-line">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-full items-center gap-1 rounded-l-lg px-2.5 py-2.5 text-sm text-ink hover:bg-mist"
          >
            <span>{country.flag}</span>
            <span className="text-muted">+{country.dial}</span>
            <CaretDown size={11} weight="bold" className="text-muted" />
          </button>

          {open && (
            <div className="absolute z-20 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-paper shadow-card">
              <div className="border-b border-line p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => {
                    blurTimeout.current = window.setTimeout(
                      () => setOpen(false),
                      120,
                    );
                  }}
                  onFocus={() => {
                    if (blurTimeout.current)
                      window.clearTimeout(blurTimeout.current);
                  }}
                  placeholder="Search country or code"
                  className="w-full rounded-md bg-mist px-2.5 py-1.5 text-sm outline-none"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {results.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCountry(c.code);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-mist"
                  >
                    <span>{c.flag}</span>
                    <span className="flex-1 truncate text-ink">{c.name}</span>
                    <span className="text-muted">+{c.dial}</span>
                  </button>
                ))}
                {results.length === 0 && (
                  <p className="px-3 py-3 text-sm text-muted">No match.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <input
          value={parsed.local}
          onChange={(e) =>
            onChange(formatPhone(parsed.country, e.target.value))
          }
          placeholder={placeholder ?? "977 123 456"}
          inputMode="numeric"
          className="w-full flex-1 rounded-r-lg px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70"
        />
      </div>
    </div>
  );
}
