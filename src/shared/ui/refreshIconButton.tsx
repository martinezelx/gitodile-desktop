import { RefreshCw } from "lucide-react";

/** The shared icon-only refresh action used by screens with cached data. */
export function RefreshIconButton({
  label,
  busyLabel,
  busy,
  className,
  onClick,
  disabled = false,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  className?: string;
  onClick: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  const accessibleLabel = busy ? busyLabel : label;
  return (
    <button
      className={`secondary-button refresh-icon-button${className ? ` ${className}` : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={accessibleLabel}
      data-tooltip={accessibleLabel}
    >
      <RefreshCw aria-hidden="true" className={busy ? "icon--spinning" : undefined} />
    </button>
  );
}
