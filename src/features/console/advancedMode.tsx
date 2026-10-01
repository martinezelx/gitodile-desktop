import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, History, ListChecks, MessageSquareOff, ShieldCheck, SquareTerminal } from "lucide-react";
import { useLanguage } from "../../i18n";
import { Dialog, DialogFacts, moveFocusWithinRadioGroup, useModalFocus } from "../../shared/ui";
import { CONSOLE_MODES, consoleModeOf, type ConsoleMode } from "./domain";
import type { ConsoleModes, ConsolePort } from "./port";
import { consolePort } from "./tauriAdapter";

/**
 * The console's two settings as the app shows them. Rust holds both and
 * checks them on every plan and run; this copy only drives the mode picker
 * and the console's indicator.
 */
export type ConsoleAdvancedModeState = ConsoleModes & {
  /** True while Rust is saving a change. */
  saving: boolean;
  error: boolean;
  /**
   * Moves to a mode. Moving down is always allowed; moving up must follow
   * the person accepting that mode's dialog, which the picker below shows.
   */
  setMode: (mode: ConsoleMode) => Promise<void>;
};

const DEFAULTS: ConsoleModes = { advancedMode: false, confirmChanges: true };

/** Reads the settings once when the app starts; they are global, not per project. */
export function useConsoleAdvancedMode(port: ConsolePort = consolePort): ConsoleAdvancedModeState {
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

  const setMode = async (target: ConsoleMode): Promise<void> => {
    setSaving(true);
    setError(false);
    // A mode that asks for more shows at once, so the console never looks
    // more permissive than Rust while the change is being saved.
    if (target === "read-only") setModes((previous) => ({ ...previous, advancedMode: false }));
    if (target === "advanced") setModes((previous) => ({ ...previous, confirmChanges: true }));
    try {
      let next: ConsoleModes = modes;
      if (target === "read-only") {
        next = await port.setAdvancedMode({ enabled: false, confirmed: false });
      } else {
        // The stricter half first: confirmations back on before advanced
        // mode turns on, never a moment of root on the way to advanced.
        if (target === "advanced" && !next.confirmChanges) {
          next = await port.setConfirmChanges({ enabled: true, confirmed: false });
        }
        if (!next.advancedMode) next = await port.setAdvancedMode({ enabled: true, confirmed: true });
        if (target === "root" && next.confirmChanges) {
          next = await port.setConfirmChanges({ enabled: false, confirmed: true });
        }
      }
      setModes(next);
    } catch {
      setError(true);
      setModes(await port.getSettings().catch(() => DEFAULTS));
    } finally {
      setSaving(false);
    }
  };
  return { ...modes, saving, error, setMode };
}

const MODE_ICONS: Record<Exclude<ConsoleMode, "read-only">, React.JSX.Element> = {
  advanced: <SquareTerminal />,
  root: <MessageSquareOff />,
};

/**
 * Settings › Console › Console mode: three cards, one per mode, first in the
 * Console section. The chosen card wears its mode's colour and a check.
 * Choosing a mode that permits more goes through a dialog saying what
 * changes; choosing one that permits less is immediate.
 */
export function ConsoleAdvancedModeSetting({ state }: { state: ConsoleAdvancedModeState }): React.JSX.Element {
  const { t } = useLanguage();
  const current = consoleModeOf(state);
  const [confirming, setConfirming] = useState<Exclude<ConsoleMode, "read-only"> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  const close = (): void => setConfirming(null);
  useModalFocus(confirming !== null, dialogRef, (open) => {
    if (!(typeof open === "function" ? open(true) : open)) close();
  });
  const rank = (mode: ConsoleMode): number => CONSOLE_MODES.indexOf(mode);
  const choose = (mode: ConsoleMode): void => {
    if (mode === current || state.saving) return;
    if (mode === "read-only" || rank(mode) < rank(current)) void state.setMode(mode);
    else setConfirming(mode);
  };
  const names: Record<ConsoleMode, string> = {
    "read-only": t.consoleModeReadOnly, advanced: t.consoleModeAdvanced, root: t.consoleModeRoot,
  };
  const descriptions: Record<ConsoleMode, string> = {
    "read-only": t.consoleModeReadOnlyDescription, advanced: t.consoleModeAdvancedDescription, root: t.consoleModeRootDescription,
  };
  const confirm = (): void => {
    const mode = confirming;
    close();
    if (mode) void state.setMode(mode);
  };
  return (
    <section className="settings-group">
      <header className="settings-group__header">
        <h3>{t.consoleSettingsModeTitle}</h3>
        <p>{t.consoleSettingsModeIntro}</p>
      </header>
      <div className="settings-group__body">
        <div className="console-modes" role="radiogroup" aria-label={t.consoleSettingsModeTitle} onKeyDown={moveFocusWithinRadioGroup}>
          {CONSOLE_MODES.map((mode) => {
            const chosen = mode === current;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-labelledby={`${idPrefix}-${mode}-name`}
                aria-describedby={`${idPrefix}-${mode}-text`}
                tabIndex={chosen ? 0 : -1}
                className={`console-mode console-mode--${mode}`}
                onClick={() => choose(mode)}
              >
                <span className="console-mode__head">
                  <span className="console-mode__dot" aria-hidden="true" />
                  <span className="console-mode__name" id={`${idPrefix}-${mode}-name`}>{names[mode]}</span>
                  {chosen && <CircleCheck className="console-mode__check" aria-hidden="true" />}
                </span>
                <span className="console-mode__text" id={`${idPrefix}-${mode}-text`}>{descriptions[mode]}</span>
              </button>
            );
          })}
        </div>
        {state.error && <p className="status-line status-line--danger" role="alert">{t.consoleAdvancedSaveFailed}</p>}
      </div>
      {confirming && (
        <Dialog
          size="m"
          title={confirming === "root" ? t.consoleRootDialogTitle : t.consoleAdvancedDialogTitle}
          titleId="console-mode-title"
          descriptionId="console-mode-body"
          icon={MODE_ICONS[confirming]}
          tone="warning"
          onClose={close}
          closeLabel={t.commonClose}
          dialogRef={dialogRef}
        >
          <p className="app-dialog__text" id="console-mode-body">
            {confirming === "root" ? t.consoleRootDialogBody : t.consoleAdvancedDialogBody}
          </p>
          <DialogFacts facts={confirming === "root" ? [
            { icon: <ListChecks />, text: t.consoleRootDialogStillShown },
            { icon: <History />, text: t.consoleAdvancedDialogLimits },
            { icon: <ShieldCheck />, text: t.consoleRootDialogStillChecked, safe: true },
          ] : [
            { icon: <ListChecks />, text: t.consoleAdvancedDialogPreview },
            { icon: <History />, text: t.consoleAdvancedDialogLimits },
            { icon: <ShieldCheck />, text: t.consoleAdvancedDialogGuided, safe: true },
          ]} />
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={close}>{t.commonCancel}</button>
            <button className="primary-button" type="button" onClick={confirm}>
              {confirming === "root" ? t.consoleRootDialogConfirm : t.consoleAdvancedDialogConfirm}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
