import { useEffect, useRef, useState } from "react";

import { isReducedMotionRequested, RefreshIconButton } from "../../shared/ui";

/** How long the refresh spinner keeps turning after a fast local check, so the
 * press reads as an action even when the probe answers in a few milliseconds.
 * The test uses the same constant, so the window lives in one place. */
export const TOOL_RECHECK_FEEDBACK_MS = 500;

/** Keep a fast local version probe visible without delaying its result. */
export function ToolRecheckButton({ label, busyLabel, busy, disabled, onClick }: {
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const [feedback, setFeedback] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return (
    <RefreshIconButton
      className="tool-row__recheck"
      label={label}
      busyLabel={busyLabel}
      busy={busy || feedback}
      disabled={disabled}
      onClick={() => {
        if (!isReducedMotionRequested()) {
          setFeedback(true);
          timer.current = setTimeout(() => {
            timer.current = null;
            setFeedback(false);
          }, TOOL_RECHECK_FEEDBACK_MS);
        }
        onClick();
      }}
    />
  );
}
