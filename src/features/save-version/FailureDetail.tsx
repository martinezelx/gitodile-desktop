import React, { useState } from "react";
import type { Translations } from "../../i18n";
import { isAppError } from "../../shared/i18n";
import { autoHideScrollbarProps } from "../../shared/ui";

/** What Git itself said when a save failed — a hook's output, most often —
 * behind a "Show technical details" toggle under the localized message. Both
 * frames of the save flow print it: the dialog, and Changes' save box, so a
 * failure is never explained in one and hidden in the other. */
export function FailureDetail({
  error,
  t,
  startExpanded = false,
}: {
  error: unknown;
  t: Translations;
  /** A hook rejection opens its own output: the hook's message *is* the
   * explanation, and hiding the only thing that says what to fix behind a
   * toggle makes the failure look arbitrary. */
  startExpanded?: boolean;
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(startExpanded);
  if (!isAppError(error) || !error.detail) {
    return null;
  }
  return (
    <div className="save-version-detail">
      <button type="button" className="save-version-detail__toggle" onClick={() => setExpanded((value) => !value)}>
        {expanded ? t.saveVersionHideDetail : t.saveVersionShowDetail}
      </button>
      {expanded && (
        <div>
          <p className="save-version-detail__heading">{t.saveVersionDetailHeading}</p>
          <pre
            {...autoHideScrollbarProps<HTMLPreElement>()}
            className="save-version-detail__body auto-hide-scrollbar"
          >
            {error.detail}
          </pre>
        </div>
      )}
    </div>
  );
}
