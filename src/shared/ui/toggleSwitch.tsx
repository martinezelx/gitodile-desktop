import React from "react";

/** The app's one on/off control.
 *
 * A component rather than a class name: the markup is `role="switch"` with
 * `aria-checked`, and a caller that only reused `.toggle-switch` would be free
 * to get that wrong. Two real consumers share it — Settings' preference rows
 * and the notification panel's own "turn them back on" — which is the bar ADR
 * 0003 sets for a primitive, so it lives here rather than in either feature.
 *
 * `label` is required and becomes the accessible name. A switch has no visible
 * text of its own, so the caller must already be saying what it switches
 * somewhere the reader can see; the label is what carries that to a screen
 * reader. */
export function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle-switch${checked ? " toggle-switch--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch__knob" />
    </button>
  );
}
