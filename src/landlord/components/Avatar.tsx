import { Avatar as ShadcnAvatar, AvatarFallback } from "@/components/ui/avatar";

/** A person's initials on a plain neutral chip, standing in for a photo we don't have. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Thin wrapper around shadcn's `Avatar` — keeps this app's existing `name`/`size` (pixel number)
 * contract while the fallback chip's fill comes from `bg-surface-muted` (the shadcn muted-surface
 * token, already used inside `AvatarFallback` — see the tokens.md collision note). */
export default function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <ShadcnAvatar style={{ width: size, height: size }} className="size-auto">
      <AvatarFallback className="font-display font-semibold" style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}
