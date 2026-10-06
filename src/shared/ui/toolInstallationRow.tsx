import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

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
 * and GitLab CLIs and the app itself, with the same geometry as an account
 * row: a 32px round tile, then the name, the installed version and the state
 * chip on one line, and the actions on the right.
 *
 * Only what the chips cannot say takes a second line: a problem (`detail`), a
 * receipt for an action the reader just took (`status`), or the consequence
 * of the primary action (`hint`). Each collapses when empty, so a settled row
 * is one line. See `.tool-row` in primitives.css and DESIGN.md § Shape. */
export function ToolInstallationRow({
  mark,
  name,
  chip,
  version,
  versionLabel,
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
  /** The installed version, shown as a chip beside the name. */
  version?: string | null;
  /** The accessible name of the version chip, such as "Installed version". */
  versionLabel?: string;
  /** Something the chips cannot say, usually a problem. */
  detail?: ReactNode;
  /** The reserved status slot: an action receipt or an update result. */
  status: ReactNode;
  /** The consequence of the primary action, or null when there is none. */
  hint?: ReactNode;
  /** The recheck beside the primary action, when the surface has one. */
  recheck?: ReactNode;
  primaryAction: ReactNode;
  /** The official guide, as a `ToolGuideButton` beside the other actions. */
  docs?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="settings-row tool-row">
      <span className="tool-row__tile" aria-hidden="true">
        {mark}
      </span>
      <div className="tool-row__body">
        <div className="tool-row__head">
          <strong className="tool-row__name">{name}</strong>
          {version && (
            <span className="tool-row__chip tool-row__chip--neutral tool-row__version">
              {versionLabel && <span className="visually-hidden">{versionLabel} </span>}
              <span>{version}</span>
            </span>
          )}
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
      <div className="settings-row__actions tool-row__buttons">
        {docs}
        {recheck}
        {primaryAction}
      </div>
    </div>
  );
}

/** The official installation guide, as an icon button beside the row's other
 * actions so every row keeps one line of controls. */
export function ToolGuideButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button className="secondary-button refresh-icon-button" type="button" aria-label={label} data-tooltip={label} onClick={onClick}>
      <ExternalLink aria-hidden="true" />
    </button>
  );
}
