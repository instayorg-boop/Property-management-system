/** The one field-label treatment for every form in the app — a required field gets a small red
 * asterisk, an optional one gets a muted "(optional)" tag, so a landlord never has to guess which
 * fields are actually mandatory before hitting submit. */
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
    <label
      className={`mb-1.5 block text-xs font-medium text-muted ${className}`}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-red-500" aria-hidden="true">
          *
        </span>
      ) : (
        <span className="ml-1 text-[11px] font-normal text-muted/70">
          (optional)
        </span>
      )}
    </label>
  );
}

/** A field's inline validation message — shown under the input once the form's been submitted at
 * least once (not while the field is merely empty on first render). */
export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-[11px] font-medium text-red-600">{children}</p>
  );
}
