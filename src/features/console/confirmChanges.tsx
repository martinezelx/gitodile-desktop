import { useEffect, useRef, useState } from "react";
import { History, ListChecks, MessageSquareOff, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../i18n";
import { Dialog, DialogFacts, ToggleSwitch, useModalFocus } from "../../shared/ui";
import type { ConsoleModes, ConsolePort } from "./port";
import { consolePort } from "./tauriAdapter";

/**
 * The console's one setting as the app shows it. Rust holds it and checks it
 * on every plan and run; this copy only drives the switch and the console's
 * indicator.
 */
export type ConsoleConfirmChangesState = ConsoleModes & {
  /** True while Rust is saving a change. */
  saving: boolean;
  error: boolean;
  /**
   * Turns confirmations on or off. On is always allowed; off must follow the
   * person accepting its dialog, which the setting below shows.
   */
  setConfirmChanges: (enabled: boolean) => Promise<void>;
};

const DEFAULTS: ConsoleModes = { confirmChanges: true };

/** Reads the setting once when the app starts; it is global, not per project. */
export function useConsoleConfirmChanges(port: ConsolePort = consolePort): ConsoleConfirmChangesState {
  const [modes, setModes] = useState<ConsoleModes>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    port.getSettings()
      .then((stored) => { if (current) setModes(stored); })
      .catch(() => { if (current) setModes(DEFAULTS); });
    return () => { current = false; };
  }, [port]);

  const setConfirmChanges = async (enabled: boolean): Promise<void> => {
    setSaving(true);
    setError(false);
    // Turning them on shows at once, so the console never looks more
    // permissive than Rust while the change is being saved.
    if (enabled) setModes({ confirmChanges: true });
    try {
      setModes(await port.setConfirmChanges({ enabled, confirmed: !enabled }));
    } catch {
      setError(true);
      setModes(await port.getSettings().catch(() => DEFAULTS));
    } finally {
      setSaving(false);
    }
  };
  return { ...modes, saving, error, setConfirmChanges };
}

/**
 * Settings › Console › Confirm each change: one switch row, first in the
 * Console group. Turning it off goes through a dialog saying what changes;
 * turning it back on is immediate.
 */
export function ConsoleConfirmChangesSetting({ state }: { state: ConsoleConfirmChangesState }): React.JSX.Element {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = (): void => setConfirming(false);
  useModalFocus(confirming, dialogRef, (open) => {
    if (!(typeof open === "function" ? open(true) : open)) close();
  });
  const change = (enabled: boolean): void => {
    if (state.saving) return;
    if (enabled) void state.setConfirmChanges(true);
    else setConfirming(true);
  };
  const turnOff = (): void => {
    close();
    void state.setConfirmChanges(false);
  };
  return (
    <>
      <div className="settings-row">
        <div>
          <strong>{t.consoleConfirmChangesLabel}</strong>
          <p>{t.consoleConfirmChangesDescription}</p>
          {state.error && <p className="status-line status-line--danger" role="alert">{t.consoleConfirmSaveFailed}</p>}
        </div>
        <ToggleSwitch label={t.consoleConfirmChangesLabel} checked={state.confirmChanges} onChange={change} />
      </div>
      {confirming && (
        <Dialog
          size="m"
          title={t.consoleConfirmOffDialogTitle}
          titleId="console-confirm-title"
          descriptionId="console-confirm-body"
          icon={<MessageSquareOff />}
          tone="warning"
          onClose={close}
          closeLabel={t.commonClose}
          dialogRef={dialogRef}
        >
          <p className="app-dialog__text" id="console-confirm-body">{t.consoleConfirmOffDialogBody}</p>
          <DialogFacts facts={[
            { icon: <ListChecks />, text: t.consoleConfirmOffDialogStillShown },
            { icon: <History />, text: t.consoleConfirmOffDialogLimits },
            { icon: <ShieldCheck />, text: t.consoleConfirmOffDialogStillChecked, safe: true },
          ]} />
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={close}>{t.commonCancel}</button>
            <button className="primary-button" type="button" onClick={turnOff}>{t.consoleConfirmOffDialogConfirm}</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
