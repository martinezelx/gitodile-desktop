import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleArrowUp,
  GitBranch,
  Info,
  LoaderCircle,
  Monitor,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sun,
  TriangleAlert,
} from "lucide-react";

import { LANGUAGE_NAMES, useLanguage, type Language, type LanguagePreference } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import type { GitDiagnostics, GitUpdateStatus, ThemePreference } from "./domain";
import type { SettingsPort } from "./port";
import { settingsPort } from "./tauriAdapter";

const THEME_ICONS: Record<ThemePreference, React.JSX.Element> = {
  system: <Monitor />,
  light: <Sun />,
  dark: <Moon />,
};

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];
const LANGUAGE_ORDER: LanguagePreference[] = ["system", "en", "es"];

export function SettingsPanel({
  theme,
  setTheme,
  gitDiagnostics,
  gitUpdateStatus,
  onCheckGitUpdate,
  isCheckingGitUpdate,
  onRefreshGitDiagnostics,
  isRefreshingGitDiagnostics,
  reopenLastProject,
  setReopenLastProject,
  confirmCloseProject,
  setConfirmCloseProject,
  port = settingsPort,
}: {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  gitDiagnostics: GitDiagnostics | null;
  gitUpdateStatus: GitUpdateStatus | null;
  onCheckGitUpdate: () => Promise<void>;
  isCheckingGitUpdate: boolean;
  onRefreshGitDiagnostics: () => Promise<void>;
  isRefreshingGitDiagnostics: boolean;
  reopenLastProject: boolean;
  setReopenLastProject: (value: boolean) => void;
  confirmCloseProject: boolean;
  setConfirmCloseProject: (value: boolean) => void;
  port?: SettingsPort;
}): React.JSX.Element {
  const { t, languagePreference, setLanguagePreference } = useLanguage();
  const [gitActionMessage, setGitActionMessage] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [isEditingIdentity, setIsEditingIdentity] = useState(true);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isStartingGitInstallation, setIsStartingGitInstallation] = useState(false);
  const [isStartingGitUpdate, setIsStartingGitUpdate] = useState(false);
  const [activeSection, setActiveSection] = useState<"general" | "appearance" | "git" | "safety">("general");

  useEffect(() => {
    port
      .getIdentity()
      .then((result) => {
        setNameInput(result.name ?? "");
        setEmailInput(result.email ?? "");
        setIsEditingIdentity(!(result.name?.trim() && result.email?.trim()));
      })
      .catch(() => undefined);
  }, [port]);

  const handleSaveIdentity = async (): Promise<void> => {
    setIdentityMessage(null);
    setIsSavingIdentity(true);
    try {
      await port.setIdentity({ name: nameInput, email: emailInput });
      setIdentityMessage(t.identitySaved);
      setIsEditingIdentity(false);
    } catch (error) {
      setIdentityMessage(localizeAppError(error, t, t.identityCouldntSave));
    } finally {
      setIsSavingIdentity(false);
    }
  };

  const handleInstallGit = async (): Promise<void> => {
    setGitActionMessage(null);
    setIsStartingGitInstallation(true);
    try {
      const result = await port.installGit();
      if (result.guidanceUrl) {
        await port.openGuidance(result.guidanceUrl);
      }
      switch (result.outcome) {
        case "started":
          setGitActionMessage(t.gitInstallerLaunched);
          break;
        case "guidance":
          setGitActionMessage(
            result.platform === "macos"
              ? t.gitMacosGuidanceOpened
              : result.platform === "linux"
                ? t.gitLinuxGuidanceOpened
                : t.gitWindowsGuidanceOpened,
          );
          break;
        case "already_starting":
          setGitActionMessage(t.gitInstallerAlreadyStarting);
          break;
        case "failed":
          setGitActionMessage(result.guidanceUrl ? t.gitInstallerFailedWithGuidance : t.gitCouldntStart);
          break;
      }
    } catch {
      setGitActionMessage(t.gitCouldntStart);
    } finally {
      setIsStartingGitInstallation(false);
    }
  };

  const handleUpdateGit = async (): Promise<void> => {
    setGitActionMessage(null);
    setIsStartingGitUpdate(true);
    try {
      const result = await port.updateGit();
      switch (result.outcome) {
        case "started":
          setGitActionMessage(t.gitUpdateLaunched);
          break;
        case "already_starting":
          setGitActionMessage(t.gitUpdateAlreadyStarting);
          break;
        case "unavailable":
          setGitActionMessage(t.gitUpdateCheckerUnavailable);
          break;
        case "failed":
          setGitActionMessage(t.gitCouldntStart);
          break;
      }
    } catch {
      setGitActionMessage(t.gitCouldntStart);
    } finally {
      setIsStartingGitUpdate(false);
    }
  };

  /* One line instead of a stack of five conditionally rendered hints. Every
     update state — never checked, checking, up to date, update waiting,
     checker broken — is the same shape (icon + sentence) with a tone, so the
     row's height never jumps as the state changes and the icon, not the
     wording, is what tells them apart at a glance. */
  const gitUpdateLine: { tone: string; icon: React.JSX.Element; message: string } | null =
    isCheckingGitUpdate || gitUpdateStatus?.state === "checking"
      ? { tone: "progress", icon: <LoaderCircle aria-hidden="true" className="icon--spinning" />, message: t.gitUpdateChecking }
      : gitUpdateStatus === null
        ? { tone: "neutral", icon: <Info aria-hidden="true" />, message: t.gitUpdateNotChecked }
        : gitUpdateStatus.state === "up_to_date"
          ? { tone: "success", icon: <CheckCircle2 aria-hidden="true" />, message: t.gitUpdateUpToDate }
          : gitUpdateStatus.state === "update_available"
            ? { tone: "accent", icon: <CircleArrowUp aria-hidden="true" />, message: t.settingsGeneralUpdateAvailable }
            : gitUpdateStatus.state === "unavailable"
              ? { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.gitUpdateCheckerUnavailable }
              : gitUpdateStatus.state === "failed"
                ? { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.gitUpdateCheckFailed }
                : gitUpdateStatus.state === "timed_out"
                  ? { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.gitUpdateCheckTimedOut }
                  : null;

  const sections = [
    { id: "general", label: t.settingsGeneralTitle, icon: <Settings /> },
    { id: "appearance", label: t.settingsAppearanceTitle, icon: <Palette /> },
    { id: "git", label: t.settingsGitTitle, icon: <GitBranch /> },
    { id: "safety", label: t.settingsSafetyTitle, icon: <ShieldCheck /> },
  ] as const;

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t.settingsSectionsAriaLabel}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`settings-nav__item${activeSection === section.id ? " settings-nav__item--active" : ""}`}
            aria-current={activeSection === section.id ? "page" : undefined}
            onClick={() => setActiveSection(section.id)}
          >
            <span aria-hidden="true">{section.icon}</span>
            {section.label}
          </button>
        ))}
      </nav>
      <div className="settings-view">
      {activeSection === "appearance" && (
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsAppearanceTitle}</h2>
          <p>{t.settingsAppearanceDescription}</p>
        </div>
        <div className="settings-groups">
          <section className="settings-group">
            <header className="settings-group__header">
              <h3>{t.themeAriaLabel}</h3>
            </header>
            <div className="settings-group__body">
        <div className="segmented-control" role="radiogroup" aria-label={t.themeAriaLabel}>
          {THEME_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={theme === option}
              className={`segmented-control__option${theme === option ? " segmented-control__option--active" : ""}`}
              onClick={() => setTheme(option)}
            >
              <span aria-hidden="true">{THEME_ICONS[option]}</span>
              {option === "system" ? t.commonSystem : option === "light" ? t.themeLight : t.themeDark}
            </button>
          ))}
        </div>
            </div>
          </section>
          <section className="settings-group">
            <header className="settings-group__header">
              <h3>{t.settingsLanguageTitle}</h3>
              <p>{t.settingsLanguageDescription}</p>
            </header>
            <div className="settings-group__body">
        <div className="segmented-control" role="radiogroup" aria-label={t.languageAriaLabel}>
          {LANGUAGE_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={languagePreference === option}
              className={`segmented-control__option${languagePreference === option ? " segmented-control__option--active" : ""}`}
              onClick={() => setLanguagePreference(option)}
            >
              {option === "system" ? t.commonSystem : LANGUAGE_NAMES[option as Language]}
            </button>
          ))}
        </div>
            </div>
          </section>
        </div>
      </section>
      )}

      {activeSection === "general" && (
        <>
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsGeneralTitle}</h2>
          <p>{t.settingsGeneralDescription}</p>
        </div>
        <div className="settings-groups">
          <section className="settings-group">
            <header className="settings-group__header">
              <h3>{t.settingsStartupTitle}</h3>
              <p>{t.settingsStartupDescription}</p>
            </header>
            <div className="settings-group__body">
              <div className="settings-row">
                <div>
                  <strong>{t.startupReopenLabel}</strong>
                  <p>{t.startupReopenDescription}</p>
                </div>
                <ToggleSwitch label={t.startupReopenLabel} checked={reopenLastProject} onChange={setReopenLastProject} />
              </div>
            </div>
          </section>
        </div>
      </section>
        </>
      )}

      {activeSection === "git" && (
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsGitTitle}</h2>
          <p>{t.settingsGitDescription}</p>
        </div>
        <div className="settings-groups">
        <section className="settings-group">
          <header className="settings-group__header">
            <h3>{t.settingsGitInstallationTitle}</h3>
            <p>{t.settingsGitInstallationDescription}</p>
          </header>
          <div className="settings-group__body">
        <div className="settings-row">
          <div className="git-install">
            {gitDiagnostics === null && (
              <p className="git-install__status git-install__status--progress">
                <LoaderCircle aria-hidden="true" className="icon--spinning" />
                <span>{t.settingsGeneralChecking}</span>
              </p>
            )}
            {gitDiagnostics?.state === "available" && (
              <>
                {/* The version is the fact this row exists to report, so it
                    gets the label + monospace value treatment rather than
                    sitting as a bare paragraph indistinguishable from the
                    hints under it. */}
                <p className="git-install__version">
                  <span className="git-install__version-label">{t.settingsGitInstalledVersionLabel}</span>
                  <span className="git-install__version-value">{gitDiagnostics.version}</span>
                </p>
                {gitUpdateLine && (
                  <p className={`git-install__status git-install__status--${gitUpdateLine.tone}`} role="status">
                    {gitUpdateLine.icon}
                    <span>{gitUpdateLine.message}</span>
                  </p>
                )}
              </>
            )}
            {gitDiagnostics?.state === "missing" && (
              <p className="git-install__status git-install__status--danger">
                <CircleAlert aria-hidden="true" />
                <span>{t.settingsGeneralGitMissing}</span>
              </p>
            )}
            {gitDiagnostics?.state === "unusable" && (
              <p className="git-install__status git-install__status--danger">
                <CircleAlert aria-hidden="true" />
                <span>{t.settingsGeneralGitUnusable}</span>
              </p>
            )}
            {gitDiagnostics?.state === "check_failed" && (
              <p className="git-install__status git-install__status--danger">
                <CircleAlert aria-hidden="true" />
                <span>{t.settingsGeneralGitCheckFailed}</span>
              </p>
            )}
            {gitActionMessage && (
              <p className="git-install__status git-install__status--neutral" role="status">
                <Info aria-hidden="true" />
                <span>{gitActionMessage}</span>
              </p>
            )}
          </div>
          <div className="settings-row__actions">
            {gitDiagnostics?.state === "missing" && (
              <button className="primary-button" type="button" disabled={isStartingGitInstallation} onClick={() => void handleInstallGit()}>
                {isStartingGitInstallation ? t.gitStartingInstaller : t.settingsGeneralInstallGit}
              </button>
            )}
            {gitDiagnostics?.state !== "available" && (
              <button className="secondary-button" type="button" disabled={isRefreshingGitDiagnostics} onClick={() => void onRefreshGitDiagnostics()}>
                {isRefreshingGitDiagnostics ? t.settingsGeneralChecking : t.settingsGeneralCheckAgain}
              </button>
            )}
            {gitDiagnostics?.state === "available" && (
              <button className="secondary-button" type="button" disabled={isCheckingGitUpdate} onClick={() => void onCheckGitUpdate()}>
                {isCheckingGitUpdate ? t.gitUpdateChecking : t.gitUpdateCheck}
              </button>
            )}
            {gitDiagnostics?.state === "available" && gitUpdateStatus?.state === "update_available" && (
              <button className="primary-button" type="button" disabled={isStartingGitUpdate} onClick={() => void handleUpdateGit()}>
                {isStartingGitUpdate ? t.gitUpdateStarting : t.settingsGeneralUpdate}
              </button>
            )}
          </div>
        </div>
          </div>
        </section>
        <section className="settings-group">
          <header className="settings-group__header">
            <h3>{t.settingsIdentityTitle}</h3>
            <p>{t.settingsIdentityDescription}</p>
          </header>
          <div className="settings-group__body">
        <div className="identity-fields">
          <label className="text-field">
            <span>{t.identityNameLabel}</span>
            <input
              type="text"
              ref={nameInputRef}
              value={nameInput}
              disabled={!isEditingIdentity}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder={t.identityNamePlaceholder}
            />
          </label>
          <label className="text-field">
            <span>{t.identityEmailLabel}</span>
            <input
              type="email"
              value={emailInput}
              disabled={!isEditingIdentity}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder={t.identityEmailPlaceholder}
            />
          </label>
        </div>
        <div className="settings-section__footer">
          {identityMessage && <p className="settings-row__hint" role="status">{identityMessage}</p>}
          {isEditingIdentity ? (
            <button
              className="primary-button"
              type="button"
              disabled={isSavingIdentity}
              onClick={() => void handleSaveIdentity()}
            >
              {isSavingIdentity ? t.identitySaving : t.identitySave}
            </button>
          ) : (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setIdentityMessage(null);
                setIsEditingIdentity(true);
                window.requestAnimationFrame(() => nameInputRef.current?.focus());
              }}
            >
              {t.identityModify}
            </button>
          )}
        </div>
          </div>
        </section>
        </div>
      </section>
      )}

      {activeSection === "safety" && (
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsSafetyTitle}</h2>
          <p>{t.settingsSafetyDescription}</p>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.safetyConfirmLabel}</strong>
            <p>{t.safetyConfirmDescription}</p>
          </div>
          <ToggleSwitch label={t.safetyConfirmLabel} checked={confirmCloseProject} onChange={setConfirmCloseProject} />
        </div>
      </section>
      )}

      </div>
    </div>
  );
}

function ToggleSwitch({
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
