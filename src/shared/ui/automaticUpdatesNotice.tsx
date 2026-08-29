import { EyeOff, RefreshCw, Settings } from "lucide-react";

export function AutomaticUpdatesNotice({
  title,
  description,
  updateLabel,
  updateAriaLabel,
  updatingLabel,
  updatingAriaLabel,
  busy,
  settingsLabel,
  onUpdate,
  onOpenSettings,
}: {
  title: string;
  description: string;
  updateLabel: string;
  updateAriaLabel: string;
  updatingLabel: string;
  updatingAriaLabel: string;
  busy: boolean;
  settingsLabel: string;
  onUpdate: () => void;
  onOpenSettings: () => void;
}): React.JSX.Element {
  return (
    <section className="automatic-updates-notice" role="status">
      <EyeOff aria-hidden="true" />
      <div className="automatic-updates-notice__body">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="automatic-updates-notice__actions">
        <button className="ghost-button" type="button" aria-label={busy ? updatingAriaLabel : updateAriaLabel} disabled={busy} onClick={onUpdate}>
          <RefreshCw aria-hidden="true" className={busy ? "icon--spinning" : undefined} />
          {busy ? updatingLabel : updateLabel}
        </button>
        <button className="ghost-button" type="button" onClick={onOpenSettings}>
          <Settings aria-hidden="true" />
          {settingsLabel}
        </button>
      </div>
    </section>
  );
}
