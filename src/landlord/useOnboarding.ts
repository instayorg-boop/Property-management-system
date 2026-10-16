import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Json } from "../lib/database.types";

export type OnboardingState = {
  answers?: { units?: string; rentCollection?: string };
  steps?: Record<string, boolean>;
  dismissed?: boolean;
};

/** Onboarding progress lives on settings.onboarding (jsonb) so it follows the landlord across
 * devices, unlike the old localStorage dismissal. */
export function useOnboarding(propertyId: string | null) {
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    let alive = true;
    supabase
      .from("settings")
      .select("onboarding")
      .eq("property_id", propertyId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setState(((data?.onboarding as OnboardingState | null) ?? {}) as OnboardingState);
      });
    return () => {
      alive = false;
    };
  }, [propertyId]);

  // A ref mirrors the latest state so the save can run outside the setState updater (React may call
  // updaters twice in dev). The Supabase query only executes when awaited/then'd, so it's awaited
  // explicitly; the old `void supabase...update()` built the query but never sent it.
  const latest = useRef<OnboardingState | null>(null);
  latest.current = state;

  const update = useCallback(
    (patch: (s: OnboardingState) => OnboardingState) => {
      const next = patch(latest.current ?? {});
      latest.current = next;
      setState(next);
      if (propertyId) {
        supabase
          .from("settings")
          .update({ onboarding: next as unknown as Json })
          .eq("property_id", propertyId)
          .then(({ error }) => {
            if (error) console.error("[onboarding] failed to save", error.message);
          });
      }
    },
    [propertyId],
  );

  return { state, update };
}
