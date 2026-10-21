import React, { useLayoutEffect, useRef } from "react";

/** The include control of a list whose items go into one action — the files
 * a version saves, the lines a clean-up deletes — drawn in History's node
 * language: a filled disc when the item is in, a ring when it is out, and a
 * half moon when only part of it (a folder, "all lines") is in. The native
 * checkbox is still the control — it keeps the label, the indeterminate
 * state and the keyboard — but it is visually hidden; the node is its drawing.
 *
 * An option for the action itself ("Also publish") is not an item and keeps
 * `.app-checkbox`.
 *
 * Standalone it is its own `<label>`, wide enough to hit. Inside a row that
 * is already a label, `inRow` draws it as a `<span>` and the row names it. */
export function InclusionNode({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
  tooltip,
  className,
  inRow = false,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  /** The input's accessible name. Leave it out inside a labelling row. */
  label?: string;
  onChange: () => void;
  tooltip?: string;
  /** The caller's layout class: column width, reach, row alignment. */
  className?: string;
  inRow?: boolean;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  // Layout effect, not effect: an item that opens partly included must draw
  // its half moon in the same frame as the rest of the row.
  useLayoutEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const classes = className ? `inclusion-node ${className}` : "inclusion-node";
  const content = (
    <>
      <input
        ref={inputRef}
        className="inclusion-node__input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={onChange}
      />
      <span className="inclusion-node__mark" aria-hidden="true" />
    </>
  );
  return inRow ? (
    <span className={classes} data-tooltip={tooltip}>{content}</span>
  ) : (
    <label className={classes} data-tooltip={tooltip}>{content}</label>
  );
}
