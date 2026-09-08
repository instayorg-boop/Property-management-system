/** A person's initials over a deterministic colour, standing in for a photo we don't have — picked
 * from their name so the same person always lands on the same colour instead of shuffling on reload. */
const AVATAR_PALETTE = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function avatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold ${avatarPalette(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}
