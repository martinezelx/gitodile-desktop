import type { ReactNode } from "react";

/** The tone of the state chip. Mirrors the status-line scale so the two never
 * disagree about what a colour means. */
export type ToolChipTone = "neutral" | "success" | "accent" | "warning" | "danger";

export type ToolChip = {
  label: string;
  tone: ToolChipTone;
  /** A glyph for the states that carry one (installed, update, failure). */
  icon?: ReactNode;
};

/** One installable or updatable thing, drawn once for Git, the optional GitHub
 * CLI and the app itself.
 *
 * The geometry is the contract: the tile, the name and the chip always occupy
 * the same line; the detail, the status line and the consequence hint always
 * follow in that order; and the action column holds an optional refresh beside
 * one contextual primary, with an optional official guide under them. Only the
 * text changes between states, so nothing moves as the thing is checked,
 * installed or updated. See `.tool-row` in primitives.css and DESIGN.md
 * § Shape. */
export function ToolInstallationRow({
  mark,
  name,
  chip,
  detail,
  status,
  hint,
  recheck,
  primaryAction,
  docs,
}: {
  /** The identity glyph shown in the round tile. */
  mark: ReactNode;
  name: string;
  chip: ToolChip;
  detail: ReactNode;
  /** The reserved status slot: an update result or an action receipt. */
  status: ReactNode;
  /** The consequence of the primary action, or null when there is none. */
  hint?: ReactNode;
  /** The left action of the pair (a recheck), when the surface has one. */
  recheck?: ReactNode;
  primaryAction: ReactNode;
  /** The official guide, shown under the buttons when there is one. */
  docs?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="settings-row tool-row">
      <div className="tool-row__body">
        <div className="tool-row__head">
          <span className="tool-row__tile" aria-hidden="true">
            {mark}
          </span>
          <strong className="tool-row__name">{name}</strong>
          <span className={`tool-row__chip tool-row__chip--${chip.tone}`}>
            {chip.icon}
            <span>{chip.label}</span>
          </span>
        </div>
        <div className="tool-row__detail">{detail}</div>
        <div className="tool-row__status" role="status">
          {status}
        </div>
        <div className="tool-row__hint">{hint}</div>
      </div>
      <div className="tool-row__actions">
        <div className="settings-row__actions tool-row__buttons">
          {recheck}
          {primaryAction}
        </div>
        {docs}
      </div>
    </div>
  );
}
