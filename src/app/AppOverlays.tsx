import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Check, CircleAlert, Copy, X } from "lucide-react";
import { useLanguage } from "../i18n";
import type { DiffPreferences } from "../features/changes";
import {
  SettingsPanel,
  isGitInstallationBroken,
  type GitToolingState,
  type SettingsSection,
  type ThemePreference,
} from "../features/settings";
import { useModalFocus } from "../shared/ui/modalFocus";
import { CROCODILE_MARK, MOD_KEY_LABEL } from "./branding";
import { describePlatform, formatDiagnostics, useSystemInfo } from "./systemInfo";

type BooleanSetter = Dispatch<SetStateAction<boolean>>;

export type AppOverlaysProps = {
  settings: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    theme: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
    section: SettingsSection;
    setSection: (section: SettingsSection) => void;
    gitTooling: GitToolingState;
    reopenLastProject: boolean;
    setReopenLastProject: BooleanSetter;
    confirmCloseProject: boolean;
    setConfirmCloseProject: BooleanSetter;
    diffPreferences: DiffPreferences;
    setDiffPreferences: Dispatch<SetStateAction<DiffPreferences>>;
    defaults: { reopenLastProject: boolean; confirmCloseProject: boolean };
    /** The open project, so the line-endings section can say when that project
     * overrides the global setting. Null when none is open. */
    project: { path: string; sessionEpoch: string } | null;
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
  const systemInfo = useSystemInfo();
  const [didCopyDiagnostics, setDidCopyDiagnostics] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The panel registers this when it has an identity draft that dismissing
  // would throw away. It returns true when it has taken over the close — by
  // saving first, or by asking — so the shell must not close behind it.
  const settingsCloseGuardRef = useRef<(() => boolean) | null>(null);
  const registerSettingsCloseGuard = useCallback((guard: (() => boolean) | null) => {
    settingsCloseGuardRef.current = guard;
  }, []);
  // `settings` is rebuilt by the caller on every render, so its setter is read
  // through a ref: a changing callback identity would make `useModalFocus`
  // reinstall its listener and re-steal focus on every keystroke in the panel.
  const setSettingsOpenRef = useRef(settings.setOpen);
  setSettingsOpenRef.current = settings.setOpen;
  const closeSettings = useCallback(() => {
    settingsCloseGuardRef.current = null;
    setSettingsOpenRef.current(false);
  }, []);
  // Shaped as a state setter because that is what `useModalFocus` takes; it
  // only ever calls it with `false`, exactly as SaveVersionDialog does.
  const requestSettingsClose = useCallback<BooleanSetter>(() => {
    if (settingsCloseGuardRef.current?.()) {
      return;
    }
    setSettingsOpenRef.current(false);
  }, []);

  // Read off the settings props because that is where Git tooling already
  // lives; About reports it, it does not own it.
  const gitVersion =
    settings.gitTooling.diagnostics?.state === "available" ? settings.gitTooling.diagnostics.version : null;
  const copyDiagnostics = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        formatDiagnostics({ appVersion: __APP_VERSION__, system: systemInfo, gitVersion }),
      );
      setDidCopyDiagnostics(true);
    } catch {
      // Nothing useful to say: the button simply does not confirm.
    }
  };
  useEffect(() => {
    if (!didCopyDiagnostics) {
      return undefined;
    }
    const timer = window.setTimeout(() => setDidCopyDiagnostics(false), 2000);
    return () => window.clearTimeout(timer);
  }, [didCopyDiagnostics]);

  useModalFocus(settings.isOpen, settingsRef, requestSettingsClose);
  useModalFocus(about.isOpen, aboutRef, about.setOpen);
  useModalFocus(shortcuts.isOpen, shortcutsRef, shortcuts.setOpen);
  useModalFocus(closeConfirmation.isOpen, closeRef, closeConfirmation.setOpen);
  useModalFocus(error.isOpen, errorRef, error.setOpen);

  return (
    <>
      {settings.isOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={() => requestSettingsClose(false)}>
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
              <div className="settings-dialog__heading">
                <h2 id="settings-dialog-title">{t.navSettings}</h2>
                <p id="settings-dialog-description">{t.settingsDialogDescription}</p>
              </div>
              {/* A broken Git installation stops every screen in the app, so it
                  cannot wait in the third section for someone to look. */}
              {isGitInstallationBroken(settings.gitTooling.diagnostics) && (
                <button
                  className="settings-dialog__alert"
                  type="button"
                  onClick={() => settings.setSection("git")}
                >
                  <CircleAlert aria-hidden="true" />
                  {t.settingsGitNeedsAttention}
                </button>
              )}
              <button className="settings-dialog__close" type="button" aria-label={t.commonClose} onClick={() => requestSettingsClose(false)}>
                <X aria-hidden="true" />
              </button>
            </header>
            <SettingsPanel
              theme={settings.theme}
              setTheme={settings.setTheme}
              activeSection={settings.section}
              onSectionChange={settings.setSection}
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
              diffPreferences={settings.diffPreferences}
              setDiffPreferences={settings.setDiffPreferences}
              defaults={settings.defaults}
              project={settings.project}
              onClose={closeSettings}
              onRegisterCloseGuard={registerSettingsCloseGuard}
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
            {/* One list, two groups: GitOdrile's own version first, then a rule,
                then what it is running on. Sharing the row grammar is what keeps
                the version from reading as a stray caption; the rule is drawn by
                the row itself, so it disappears when nothing follows it. */}
            <dl className="about-details">
              <div className="about-details__app"><dt>{t.commonVersion}</dt><dd>{__APP_VERSION__}</dd></div>
              {systemInfo && (
                <>
                  {/* Name and build are separate rows on purpose. Windows 11
                      reports NT 10.0, so a combined "Windows 10.0.26200" tells
                      a Windows 11 user the wrong thing. */}
                  <div><dt>{t.aboutSystem}</dt><dd>{describePlatform(systemInfo)} ({systemInfo.arch})</dd></div>
                  <div><dt>{t.aboutSystemVersion}</dt><dd>{systemInfo.version}</dd></div>
                </>
              )}
              {gitVersion && <div><dt>{t.aboutGitVersion}</dt><dd>{gitVersion}</dd></div>}
            </dl>
            <button className="secondary-button about-dialog__copy" type="button" onClick={() => void copyDiagnostics()}>
              {didCopyDiagnostics ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {didCopyDiagnostics ? t.aboutCopied : t.aboutCopySystemInfo}
            </button>
            <p className="about-dialog__footer">
              {t.aboutFooterMadeWith}{" "}
              <span className="about-dialog__heart" role="img" aria-label={t.aboutHeartLabel}>♥</span>{" "}
              {t.aboutFooterByAuthor}
            </p>
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
              <li><span>{t.shortcutsOpenSettings}</span><span className="shortcuts-list__keys"><kbd>{MOD_KEY_LABEL}</kbd><kbd>,</kbd></span></li>
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
