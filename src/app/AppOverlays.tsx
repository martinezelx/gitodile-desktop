import React, { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../i18n";
import { SettingsPanel, type GitToolingState, type ThemePreference } from "../features/settings";
import { useModalFocus } from "../shared/ui/modalFocus";
import { CROCODILE_MARK, MOD_KEY_LABEL } from "./branding";

type BooleanSetter = Dispatch<SetStateAction<boolean>>;

export type AppOverlaysProps = {
  settings: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    theme: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
    gitTooling: GitToolingState;
    reopenLastProject: boolean;
    setReopenLastProject: BooleanSetter;
    confirmCloseProject: boolean;
    setConfirmCloseProject: BooleanSetter;
  };
  about: { isOpen: boolean; setOpen: BooleanSetter };
  shortcuts: { isOpen: boolean; setOpen: BooleanSetter };
  closeConfirmation: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    projectName: string | null;
    onConfirm: () => void;
  };
  error: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    title: string;
    message: string | null;
  };
};

export function AppOverlays({
  settings,
  about,
  shortcuts,
  closeConfirmation,
  error,
}: AppOverlaysProps): React.JSX.Element {
  const { t } = useLanguage();
  const settingsRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useModalFocus(settings.isOpen, settingsRef, settings.setOpen);
  useModalFocus(about.isOpen, aboutRef, about.setOpen);
  useModalFocus(shortcuts.isOpen, shortcutsRef, shortcuts.setOpen);
  useModalFocus(closeConfirmation.isOpen, closeRef, closeConfirmation.setOpen);
  useModalFocus(error.isOpen, errorRef, error.setOpen);

  return (
    <>
      {settings.isOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => settings.setOpen(false)}>
          <div
            ref={settingsRef}
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            aria-describedby="settings-dialog-description"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="settings-dialog__header">
              <div>
                <h2 id="settings-dialog-title">{t.navSettings}</h2>
                <p id="settings-dialog-description">{t.settingsDialogDescription}</p>
              </div>
              <button className="settings-dialog__close" type="button" aria-label={t.commonClose} onClick={() => settings.setOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </header>
            <SettingsPanel
              theme={settings.theme}
              setTheme={settings.setTheme}
              gitDiagnostics={settings.gitTooling.diagnostics}
              gitUpdateStatus={settings.gitTooling.updateStatus}
              onCheckGitUpdate={settings.gitTooling.checkUpdate}
              isCheckingGitUpdate={settings.gitTooling.isCheckingUpdate}
              onRefreshGitDiagnostics={settings.gitTooling.refreshDiagnostics}
              isRefreshingGitDiagnostics={settings.gitTooling.isRefreshingDiagnostics}
              reopenLastProject={settings.reopenLastProject}
              setReopenLastProject={settings.setReopenLastProject}
              confirmCloseProject={settings.confirmCloseProject}
              setConfirmCloseProject={settings.setConfirmCloseProject}
            />
          </div>
        </div>
      )}

      {about.isOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => about.setOpen(false)}>
          <div ref={aboutRef} className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <button className="about-dialog__close" type="button" aria-label={t.commonClose} onClick={() => about.setOpen(false)}>
              <X aria-hidden="true" />
            </button>
            <div className="about-dialog__mark" aria-hidden="true">{CROCODILE_MARK}</div>
            <p className="eyebrow">{t.aboutGitOdrile}</p>
            <h2 id="about-title">{t.aboutHeading}</h2>
            <p>{t.aboutDescription}</p>
            <dl className="about-details"><div><dt>{t.commonVersion}</dt><dd>{__APP_VERSION__}</dd></div></dl>
            <p className="about-dialog__footer">{t.aboutFooterMadeWith}</p>
          </div>
        </div>
      )}

      {shortcuts.isOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => shortcuts.setOpen(false)}>
          <div ref={shortcutsRef} className="about-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <button className="about-dialog__close" type="button" aria-label={t.commonClose} onClick={() => shortcuts.setOpen(false)}>
              <X aria-hidden="true" />
            </button>
            <h2 id="shortcuts-title">{t.shortcutsDialogTitle}</h2>
            <ul className="shortcuts-list">
              <li><span>{t.shortcutsOpenPalette}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>K</kbd></span></li>
              <li><span>{t.shortcutsNextProject}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>Tab</kbd></span></li>
              <li><span>{t.shortcutsPreviousProject}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>Shift</kbd><kbd>Tab</kbd></span></li>
              <li><span>{t.shortcutsCloseDialogs}</span><span className="shortcuts-list__keys"><kbd>Esc</kbd></span></li>
            </ul>
          </div>
        </div>
      )}

      {closeConfirmation.isOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => closeConfirmation.setOpen(false)}>
          <div ref={closeRef} className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="close-confirm-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="close-confirm-title">{t.closeConfirmTitle}</h2>
            <p>{closeConfirmation.projectName ? t.closeConfirmBodyNamed(closeConfirmation.projectName) : t.closeConfirmBodyGeneric}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => closeConfirmation.setOpen(false)}>{t.commonCancel}</button>
              <button className="primary-button" type="button" onClick={closeConfirmation.onConfirm}>{t.overviewCloseProject}</button>
            </div>
          </div>
        </div>
      )}

      {error.isOpen && error.message && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => error.setOpen(false)}>
          <div ref={errorRef} className="about-dialog" role="alertdialog" aria-modal="true" aria-labelledby="open-error-title" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="open-error-title">{error.title}</h2>
            <p role="alert">{error.message}</p>
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={() => error.setOpen(false)}>{t.commonClose}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
