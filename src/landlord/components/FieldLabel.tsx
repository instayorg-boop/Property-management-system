import { cn } from "cn";

/** The one field-label treatment for every form in the app — a required field gets a small
 * asterisk immediately after the label text (per the create-edit-form archetype's convention), an
 * optional one gets a muted "(optional)" tag, so a landlord never has to guess which fields are
 * actually mandatory before hitting submit. */
export default function FieldLabel({
  children,
  required = false,
  className = "",
}: {
  children: React.ReactNode;
  /** Defaults to false (shows "(optional)") — pass true for a field the form can't be submitted without. */
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("mb-1.5 block text-xs font-medium text-muted-foreground", className)}>
      {children}
      {required ? (
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      ) : (
        <span className="ml-1 text-[11px] font-normal text-muted-foreground/70">(optional)</span>
      )}
    </label>
  );
}

/** A field's inline validation message — shown under the input once the form's been submitted at
 * least once (not while the field is merely empty on first render). Per the create-edit-form
 * archetype: `text-destructive`, replacing help text rather than sitting alongside it. */
export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] font-medium text-destructive">{children}</p>;
}
