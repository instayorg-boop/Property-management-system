import { FunctionsHttpError } from "@supabase/supabase-js";

/** supabase.functions.invoke() sets `data` to null on any non-2xx response (it throws before
 * parsing the body as data) — so `data?.error` is always undefined for real errors, and every
 * edge-function caller that did `data?.error ?? error?.message` was silently falling back to
 * FunctionsHttpError's generic "Edge Function returned a non-2xx status code" instead of the
 * function's actual message. The real body is still there, just on `error.context` (the raw
 * Response) — this reads it out. */
export async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // body wasn't JSON — fall through to the generic message below
    }
  }
  return error instanceof Error ? error.message : fallback;
}
