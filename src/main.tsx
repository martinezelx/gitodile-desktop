import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  LayoutDashboard,
  GitCompare,
  GitCommitHorizontal,
  LifeBuoy,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  Moon,
  Monitor,
  FolderOpen,
} from "lucide-react";
import { LANGUAGE_NAMES, LanguageProvider, useLanguage, type Language, type LanguagePreference } from "./i18n";
import "./styles.css";

type ThemePreference = "system" | "light" | "dark";
type View = "overview" | "settings";
type RepositoryInfo = {
  name: string;
  path: string;
  selectedPath: string;
  gitDir: string;
  commonGitDir: string;
  branch: string | null;
  headState: "branch" | "detached" | "unborn";
  kind: "repository" | "worktree";
};
type AppError = {
  code:
    | "path_missing"
    | "path_unusable"
    | "not_repository"
    | "bare_repository"
    | "git_missing"
    | "git_unusable"
    | "git_command_failed"
    | "invalid_identity"
    | "git_config_write_failed";
  message: string;
  remediation: string | null;
};
type GitDiagnostics = {
  state: "available" | "missing" | "unusable" | "check_failed";
  version: string | null;
};
type GitInstallationResult = {
  outcome: "started" | "guidance" | "already_starting" | "failed";
  platform: "windows" | "macos" | "linux" | "unsupported";
  guidanceUrl: string | null;
};
type GitUpdateStatus = {
  state: "checking" | "unavailable" | "up_to_date" | "update_available" | "failed" | "timed_out";
  cached: boolean;
};
type GitUpdateLaunchResult = {
  outcome: "started" | "already_starting" | "unavailable" | "failed";
};
type GitIdentity = { name: string | null; email: string | null };

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

function useModalFocus<T extends HTMLElement>(
  isOpen: boolean,
  dialogRef: React.RefObject<T | null>,
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = (): void => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      (getFocusableElements(dialog)[0] ?? dialog).focus();
    };
    const animationFrame = window.requestAnimationFrame(focusDialog);
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [dialogRef, isOpen, setIsOpen]);
}

const THEME_STORAGE_KEY = "gitodrile-theme";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "gitodrile-sidebar-collapsed";
const LAST_PROJECT_PATH_STORAGE_KEY = "gitodrile-last-project-path";
const REOPEN_LAST_PROJECT_STORAGE_KEY = "gitodrile-reopen-last-project";
const CONFIRM_CLOSE_PROJECT_STORAGE_KEY = "gitodrile-confirm-close-project";
const APP_VERSION = "0.1.0";

function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

function localizeAppError(error: unknown, t: ReturnType<typeof useLanguage>["t"], fallback: string): string {
  if (!isAppError(error)) {
    return typeof error === "string" ? error : fallback;
  }

  const messages: Record<AppError["code"], string> = {
    path_missing: t.errorPathMissing,
    path_unusable: t.errorPathUnusable,
    not_repository: t.errorNotRepository,
    bare_repository: t.errorBareRepository,
    git_missing: t.errorGitMissing,
    git_unusable: t.errorGitUnusable,
    git_command_failed: t.errorGitCommandFailed,
    invalid_identity: t.errorInvalidIdentity,
    git_config_write_failed: t.errorGitConfigWriteFailed,
  };
  return messages[error.code] ?? fallback;
}

function repositoryStatus(project: RepositoryInfo, t: ReturnType<typeof useLanguage>["t"]): string {
  if (project.headState === "detached") {
    return project.kind === "worktree" ? t.overviewWorktreeDetached : t.overviewRepositoryDetached;
  }
  if (project.headState === "unborn") {
    return project.kind === "worktree"
      ? t.overviewWorktreeUnborn(project.branch ?? "")
      : t.overviewRepositoryUnborn(project.branch ?? "");
  }
  return project.kind === "worktree"
    ? t.overviewWorktreeBranch(project.branch ?? "")
    : t.overviewRepositoryBranch(project.branch ?? "");
}

function readStoredBoolean(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === null ? defaultValue : stored === "true";
}

function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(theme: ThemePreference): void {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function useTheme(): [ThemePreference, (theme: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

const THEME_ICONS: Record<ThemePreference, React.JSX.Element> = {
  system: <Monitor />,
  light: <Sun />,
  dark: <Moon />,
};

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];
const LANGUAGE_ORDER: LanguagePreference[] = ["system", "en", "es"];

const NAV_ICONS = {
  overview: <LayoutDashboard />,
  changes: <GitCompare />,
  history: <GitCommitHorizontal />,
  recovery: <LifeBuoy />,
  settings: <Settings2 />,
  collapse: <PanelLeftClose />,
  expand: <PanelLeftOpen />,
} as const;

const SEARCH_ICON = <Search />;

// Temporary placeholder mark until a custom GitOdrile mascot exists.
// Crocodile line art from OpenMoji (openmoji.org), CC BY-SA 4.0.
const CROCODILE_MARK = (
  <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.6">
    <line x1="29" x2="33" y1="52" y2="52" />
    <path d="M46,52c0,0,17,2,19,0v-1c0,0,3-3,1-4s-5,0-5,0s-2.9167-1.3333-6.4583-4.6667C54.5417,42.3333,53,41,51,43c0,0-2-3-8-3s-24,1-24,1 s-6-1,0-3s11-2,12,0c0,0-2.6667-8.4167-17.3333-5.2083C13.6667,32.7917,1,36,8,48c0,0,2,4,8,4" />
    <path d="M23,47c0,0-4.8121,4-3.406,5S23,55,23,55h4l-3.0324-3c0,0,2.0324-1,3.0324-3s0-3.2403,0-3.2403" />
    <path d="M40,47c0,0-4.8121,4-3.406,5S40,55,40,55h4l-3.0324-3c0,0,2.0324-1,3.0324-3s0-3.2403,0-3.2403" />
  </svg>
);

type Command = { id: string; label: string; hint?: string; action: () => void };

function CommandPalette({
  isOpen,
  onClose,
  commands,
}: {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const runCommand = (command: Command | undefined): void => {
    if (!command) {
      return;
    }
    command.action();
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(filtered[selectedIndex]);
    }
  };

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.paletteAriaLabel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <span aria-hidden="true">{SEARCH_ICON}</span>
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={filtered[selectedIndex] ? `palette-option-${filtered[selectedIndex].id}` : undefined}
            aria-autocomplete="list"
            placeholder={t.palettePlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <ul className="palette-list" id="palette-list" role="listbox">
          {filtered.length === 0 && <li className="palette-empty">{t.paletteNoMatches}</li>}
          {filtered.map((command, index) => (
            <li
              key={command.id}
              id={`palette-option-${command.id}`}
              role="option"
              aria-selected={index === selectedIndex}
              className="palette-item"
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                runCommand(command);
              }}
            >
              {command.label}
              {command.hint && <span className="palette-item__hint">{command.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const FOLDER_ICON = <FolderOpen />;

function OverviewPanel({
  project,
  openError,
  isOpening,
  onOpenProject,
  onCloseProject,
}: {
  project: RepositoryInfo | null;
  openError: string | null;
  isOpening: boolean;
  onOpenProject: () => void;
  onCloseProject: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  if (project) {
    return (
      <div className="project-summary">
        <div className="project-summary__icon" aria-hidden="true">{FOLDER_ICON}</div>
        <div className="project-summary__body">
          <h2>
            {project.name}
            {project.kind === "worktree" && <span className="project-summary__badge">{t.overviewWorktreeBadge}</span>}
          </h2>
          <p className="project-summary__meta">{repositoryStatus(project, t)}</p>
          <p className="project-summary__path">{project.path}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onCloseProject}>
          {t.overviewCloseProject}
        </button>
      </div>
    );
  }

  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">{FOLDER_ICON}</div>
      <h2>{t.overviewEmptyTitle}</h2>
      <p>{t.overviewEmptyDescription}</p>
      {openError && <p className="empty-state__error" role="alert">{openError}</p>}
      <div className="empty-state__actions">
        <button className="primary-button" type="button" onClick={onOpenProject} disabled={isOpening}>
          {isOpening ? t.overviewOpening : t.overviewOpenProject}
        </button>
        <button className="secondary-button" type="button" disabled title={t.overviewCloneComingSoonTitle}>
          {t.overviewCloneFromGithub}
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({
  theme,
  setTheme,
  onOpenAbout,
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
}: {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  onOpenAbout: () => void;
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

  useEffect(() => {
    invoke<GitIdentity>("get_git_identity")
      .then((result) => {
        setNameInput(result.name ?? "");
        setEmailInput(result.email ?? "");
        setIsEditingIdentity(!(result.name?.trim() && result.email?.trim()));
      })
      .catch(() => undefined);
  }, []);

  const handleSaveIdentity = async (): Promise<void> => {
    setIdentityMessage(null);
    setIsSavingIdentity(true);
    try {
      await invoke("set_git_identity", { name: nameInput, email: emailInput });
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
      const result = await invoke<GitInstallationResult>("install_git");
      if (result.guidanceUrl) {
        await openUrl(result.guidanceUrl);
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
      const result = await invoke<GitUpdateLaunchResult>("update_git");
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

  return (
    <div className="settings-view">
      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsAppearanceTitle}</h2>
          <p>{t.settingsAppearanceDescription}</p>
        </div>
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
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsGeneralTitle}</h2>
          <p>{t.settingsGeneralDescription}</p>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.commonVersion}</strong>
            <p>GitOdrile {APP_VERSION}</p>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenAbout}>
            {t.settingsGeneralViewAbout}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.settingsGeneralGitLabel}</strong>
            {gitDiagnostics === null && <p>{t.settingsGeneralChecking}</p>}
            {gitDiagnostics?.state === "available" && (
              <>
                <p>
                  {gitDiagnostics.version}
                  {gitUpdateStatus?.state === "update_available" && (
                  <span className="settings-row__badge">{t.settingsGeneralUpdateAvailable}</span>
                  )}
                </p>
                {gitUpdateStatus === null && <p className="settings-row__hint">{t.gitUpdateNotChecked}</p>}
                {(isCheckingGitUpdate || gitUpdateStatus?.state === "checking") && (
                  <p className="settings-row__hint" role="status">{t.gitUpdateChecking}</p>
                )}
                {gitUpdateStatus?.state === "up_to_date" && (
                  <p className="settings-row__hint" role="status">{t.gitUpdateUpToDate}</p>
                )}
                {gitUpdateStatus?.state === "unavailable" && (
                  <p className="settings-row__hint settings-row__warning" role="status">
                    {t.gitUpdateCheckerUnavailable}
                  </p>
                )}
                {gitUpdateStatus?.state === "failed" && (
                  <p className="settings-row__hint settings-row__warning" role="status">{t.gitUpdateCheckFailed}</p>
                )}
                {gitUpdateStatus?.state === "timed_out" && (
                  <p className="settings-row__hint settings-row__warning" role="status">{t.gitUpdateCheckTimedOut}</p>
                )}
              </>
            )}
            {gitDiagnostics?.state === "missing" && (
              <p className="settings-row__warning">{t.settingsGeneralGitMissing}</p>
            )}
            {gitDiagnostics?.state === "unusable" && (
              <p className="settings-row__warning">{t.settingsGeneralGitUnusable}</p>
            )}
            {gitDiagnostics?.state === "check_failed" && (
              <p className="settings-row__warning">{t.settingsGeneralGitCheckFailed}</p>
            )}
            {gitActionMessage && <p className="settings-row__hint" role="status">{gitActionMessage}</p>}
          </div>
          <div className="settings-row__actions">
            {gitDiagnostics?.state === "missing" && (
              <button
                className="primary-button"
                type="button"
                disabled={isStartingGitInstallation}
                onClick={() => void handleInstallGit()}
              >
                {isStartingGitInstallation ? t.gitStartingInstaller : t.settingsGeneralInstallGit}
              </button>
            )}
            {gitDiagnostics?.state !== "available" && (
              <button
                className="secondary-button"
                type="button"
                disabled={isRefreshingGitDiagnostics}
                onClick={() => void onRefreshGitDiagnostics()}
              >
                {isRefreshingGitDiagnostics ? t.settingsGeneralChecking : t.settingsGeneralCheckAgain}
              </button>
            )}
            {gitDiagnostics?.state === "available" && (
              <button
                className="secondary-button"
                type="button"
                disabled={isCheckingGitUpdate}
                onClick={() => void onCheckGitUpdate()}
              >
                {isCheckingGitUpdate ? t.gitUpdateChecking : t.gitUpdateCheck}
              </button>
            )}
            {gitDiagnostics?.state === "available" && gitUpdateStatus?.state === "update_available" && (
              <button
                className="primary-button"
                type="button"
                disabled={isStartingGitUpdate}
                onClick={() => void handleUpdateGit()}
              >
                {isStartingGitUpdate ? t.gitUpdateStarting : t.settingsGeneralUpdate}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsIdentityTitle}</h2>
          <p>{t.settingsIdentityDescription}</p>
        </div>
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
      </section>

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsStartupTitle}</h2>
          <p>{t.settingsStartupDescription}</p>
        </div>
        <div className="settings-row">
          <div>
            <strong>{t.startupReopenLabel}</strong>
            <p>{t.startupReopenDescription}</p>
          </div>
          <ToggleSwitch label={t.startupReopenLabel} checked={reopenLastProject} onChange={setReopenLastProject} />
        </div>
      </section>

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

      <section className="settings-section">
        <div className="settings-section__heading">
          <h2>{t.settingsLanguageTitle}</h2>
          <p>{t.settingsLanguageDescription}</p>
        </div>
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
      </section>
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

function App(): React.JSX.Element {
  const { t } = useLanguage();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
  );
  const [project, setProject] = useState<RepositoryInfo | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [gitDiagnostics, setGitDiagnostics] = useState<GitDiagnostics | null>(null);
  const [isRefreshingGitDiagnostics, setIsRefreshingGitDiagnostics] = useState(false);
  const [gitUpdateStatus, setGitUpdateStatus] = useState<GitUpdateStatus | null>(null);
  const [isCheckingGitUpdate, setIsCheckingGitUpdate] = useState(false);
  const [reopenLastProject, setReopenLastProject] = useState(() =>
    readStoredBoolean(REOPEN_LAST_PROJECT_STORAGE_KEY, false),
  );
  const [confirmCloseProject, setConfirmCloseProject] = useState(() =>
    readStoredBoolean(CONFIRM_CLOSE_PROJECT_STORAGE_KEY, true),
  );
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const aboutDialogRef = useRef<HTMLDivElement>(null);
  const closeConfirmDialogRef = useRef<HTMLDivElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const palettePreviouslyFocusedRef = useRef<HTMLElement | null>(null);

  useModalFocus(isAboutOpen, aboutDialogRef, setIsAboutOpen);
  useModalFocus(isCloseConfirmOpen, closeConfirmDialogRef, setIsCloseConfirmOpen);

  const openPalette = (): void => {
    palettePreviouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsPaletteOpen(true);
  };

  const closePalette = (): void => {
    setIsPaletteOpen(false);
    (palettePreviouslyFocusedRef.current ?? paletteTriggerRef.current)?.focus();
  };

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(REOPEN_LAST_PROJECT_STORAGE_KEY, String(reopenLastProject));
  }, [reopenLastProject]);

  useEffect(() => {
    localStorage.setItem(CONFIRM_CLOSE_PROJECT_STORAGE_KEY, String(confirmCloseProject));
  }, [confirmCloseProject]);

  const refreshGitDiagnostics = async (): Promise<void> => {
    setIsRefreshingGitDiagnostics(true);
    try {
      const result = await invoke<GitDiagnostics>("git_diagnostics");
      setGitDiagnostics(result);
      if (result.state !== "available") {
        setGitUpdateStatus(null);
      }
    } catch {
      setGitDiagnostics({ state: "check_failed", version: null });
    } finally {
      setIsRefreshingGitDiagnostics(false);
    }
  };

  useEffect(() => {
    void refreshGitDiagnostics();
  }, []);

  const checkGitUpdate = async (): Promise<void> => {
    setIsCheckingGitUpdate(true);
    setGitUpdateStatus({ state: "checking", cached: false });
    try {
      setGitUpdateStatus(await invoke<GitUpdateStatus>("check_git_update"));
    } catch {
      setGitUpdateStatus({ state: "failed", cached: false });
    } finally {
      setIsCheckingGitUpdate(false);
    }
  };

  const handleOpenProject = async (): Promise<void> => {
    setOpenError(null);
    try {
      const selected = await openFolderDialog({ directory: true, multiple: false, title: t.overviewOpenDialogTitle });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      setIsOpening(true);
      const info = await invoke<RepositoryInfo>("open_repository", { path: selected });
      setProject(info);
      localStorage.setItem(LAST_PROJECT_PATH_STORAGE_KEY, info.path);
    } catch (error) {
      setOpenError(localizeAppError(error, t, t.overviewCouldntOpenFolder));
    } finally {
      setIsOpening(false);
    }
  };

  useEffect(() => {
    if (!reopenLastProject) {
      return;
    }
    const lastPath = localStorage.getItem(LAST_PROJECT_PATH_STORAGE_KEY);
    if (!lastPath) {
      return;
    }
    invoke<RepositoryInfo>("open_repository", { path: lastPath })
      .then(setProject)
      .catch(() => localStorage.removeItem(LAST_PROJECT_PATH_STORAGE_KEY));
    // Only ever run once, on launch — reopenLastProject changing later
    // shouldn't retrigger an auto-open mid-session.
  }, []);

  const closeProject = (): void => {
    setProject(null);
    localStorage.removeItem(LAST_PROJECT_PATH_STORAGE_KEY);
    setIsCloseConfirmOpen(false);
  };

  const requestCloseProject = (): void => {
    if (confirmCloseProject) {
      setIsCloseConfirmOpen(true);
    } else {
      closeProject();
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openPalette();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const commands: Command[] = [
    { id: "go-overview", label: t.commandGoOverview, action: () => setView("overview") },
    { id: "go-settings", label: t.commandGoSettings, action: () => setView("settings") },
    ...(project
      ? [{ id: "close-project", label: t.overviewCloseProject, action: requestCloseProject }]
      : [{ id: "open-project", label: t.overviewOpenProject, action: () => void handleOpenProject() }]),
    { id: "theme-system", label: t.commandUseSystemTheme, action: () => setTheme("system") },
    { id: "theme-light", label: t.commandUseLightTheme, action: () => setTheme("light") },
    { id: "theme-dark", label: t.commandUseDarkTheme, action: () => setTheme("dark") },
    {
      id: "toggle-sidebar",
      label: isSidebarCollapsed ? t.sidebarExpand : t.sidebarCollapse,
      action: () => setIsSidebarCollapsed((collapsed) => !collapsed),
    },
    { id: "about", label: t.aboutGitOdrile, action: () => setIsAboutOpen(true) },
  ];

  const appWindow = "__TAURI_INTERNALS__" in window
    ? getCurrentWindow()
    : { minimize: async () => {}, toggleMaximize: async () => {}, close: async () => {} };
  const performWindowAction = (action: () => Promise<void>): void => {
    void action().catch(() => undefined);
  };

  return (
    <div className="app-window">
      <header className="window-titlebar">
        <div
          className="window-titlebar__drag window-titlebar__drag--left"
          data-tauri-drag-region
          onDoubleClick={() => performWindowAction(() => appWindow.toggleMaximize())}
        >
          <div className="window-titlebar__brand" data-tauri-drag-region>
            <span className="window-titlebar__mark" aria-hidden="true">{CROCODILE_MARK}</span>
            <span className="window-titlebar__name" data-tauri-drag-region>GitOdrile</span>
          </div>
        </div>

        <div className="window-titlebar__center">
          <button
            className="command-trigger"
            type="button"
            ref={paletteTriggerRef}
            aria-label={t.titlebarOpenCommandPalette}
            title={t.titlebarJumpToHint}
            onClick={openPalette}
          >
            <span aria-hidden="true">{SEARCH_ICON}</span>
            <span>{t.titlebarJumpTo}</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>

        <div className="window-titlebar__right">
          <div
            className="window-titlebar__drag window-titlebar__drag--right"
            data-tauri-drag-region
            onDoubleClick={() => performWindowAction(() => appWindow.toggleMaximize())}
          />
          <div className="window-controls" aria-label={t.windowControls}>
            <button
              className="window-control"
              type="button"
              aria-label={t.windowMinimize}
              onClick={() => performWindowAction(() => appWindow.minimize())}
            >
              <span aria-hidden="true">−</span>
            </button>
            <button
              className="window-control"
              type="button"
              aria-label={t.windowMaximize}
              onClick={() => performWindowAction(() => appWindow.toggleMaximize())}
            >
              <span className="window-control__maximize" aria-hidden="true" />
            </button>
            <button
              className="window-control window-control--close"
              type="button"
              aria-label={t.windowClose}
              onClick={() => performWindowAction(() => appWindow.close())}
            >
              <span className="window-control__close" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className={`app-shell${isSidebarCollapsed ? " app-shell--collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">{CROCODILE_MARK}</div>
              {!isSidebarCollapsed && (
                <div>
                  <strong>GitOdrile</strong>
                  <span>{t.brandTagline}</span>
                </div>
              )}
            </div>
            <button
              className="sidebar-toggle"
              type="button"
              title={isSidebarCollapsed ? t.sidebarExpand : t.sidebarCollapse}
              aria-label={isSidebarCollapsed ? t.sidebarExpand : t.sidebarCollapse}
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            >
              <span aria-hidden="true">{isSidebarCollapsed ? NAV_ICONS.expand : NAV_ICONS.collapse}</span>
            </button>
          </div>

          <nav aria-label={t.navProjectAriaLabel}>
            <button
              className={`nav-item${view === "overview" ? " nav-item--active" : ""}`}
              type="button"
              aria-current={view === "overview" ? "page" : undefined}
              title={t.navOverview}
              onClick={() => setView("overview")}
            >
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.overview}</span>
              <span className="nav-item__label">{t.navOverview}</span>
            </button>
            <button className="nav-item" type="button" disabled title={t.navChangesTitle}>
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.changes}</span>
              <span className="nav-item__label">{t.navChanges}</span>
            </button>
            <button className="nav-item" type="button" disabled title={t.navHistoryTitle}>
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.history}</span>
              <span className="nav-item__label">{t.navHistory}</span>
            </button>
            <button className="nav-item" type="button" disabled title={t.navRecoveryTitle}>
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.recovery}</span>
              <span className="nav-item__label">{t.navRecovery}</span>
            </button>
          </nav>

          <nav aria-label={t.navApplicationAriaLabel} className="nav--secondary">
            <button
              className={`nav-item${view === "settings" ? " nav-item--active" : ""}`}
              type="button"
              aria-current={view === "settings" ? "page" : undefined}
              title={t.navSettings}
              onClick={() => setView("settings")}
            >
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.settings}</span>
              <span className="nav-item__label">{t.navSettings}</span>
            </button>
          </nav>
        </aside>

        <section className="workspace">
          <nav className="compact-nav" aria-label={t.navApplicationAriaLabel}>
            <button
              className={`compact-nav__item${view === "overview" ? " compact-nav__item--active" : ""}`}
              type="button"
              aria-current={view === "overview" ? "page" : undefined}
              onClick={() => setView("overview")}
            >
              <span aria-hidden="true">{NAV_ICONS.overview}</span>
              {t.navOverview}
            </button>
            <button
              className={`compact-nav__item${view === "settings" ? " compact-nav__item--active" : ""}`}
              type="button"
              aria-current={view === "settings" ? "page" : undefined}
              onClick={() => setView("settings")}
            >
              <span aria-hidden="true">{NAV_ICONS.settings}</span>
              {t.navSettings}
            </button>
          </nav>
          <header className="topbar">
            <h1>{view === "overview" ? t.navOverview : t.navSettings}</h1>
          </header>

          {view === "overview" ? (
            <OverviewPanel
              project={project}
              openError={openError}
              isOpening={isOpening}
              onOpenProject={() => void handleOpenProject()}
              onCloseProject={requestCloseProject}
            />
          ) : (
            <SettingsPanel
              theme={theme}
              setTheme={setTheme}
              onOpenAbout={() => setIsAboutOpen(true)}
              gitDiagnostics={gitDiagnostics}
              gitUpdateStatus={gitUpdateStatus}
              onCheckGitUpdate={checkGitUpdate}
              isCheckingGitUpdate={isCheckingGitUpdate}
              onRefreshGitDiagnostics={refreshGitDiagnostics}
              isRefreshingGitDiagnostics={isRefreshingGitDiagnostics}
              reopenLastProject={reopenLastProject}
              setReopenLastProject={setReopenLastProject}
              confirmCloseProject={confirmCloseProject}
              setConfirmCloseProject={setConfirmCloseProject}
            />
          )}
        </section>
      </main>

      <CommandPalette isOpen={isPaletteOpen} onClose={closePalette} commands={commands} />

      {isAboutOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => setIsAboutOpen(false)}>
          <div
            ref={aboutDialogRef}
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="about-dialog__mark" aria-hidden="true">{CROCODILE_MARK}</div>
            <p className="eyebrow">{t.aboutGitOdrile}</p>
            <h2 id="about-title">{t.aboutHeading}</h2>
            <p>{t.aboutDescription}</p>
            <dl className="about-details">
              <div><dt>{t.commonVersion}</dt><dd>{APP_VERSION}</dd></div>
              <div><dt>{t.aboutBuiltWithLabel}</dt><dd>{t.aboutBuiltWithValue}</dd></div>
            </dl>
            <button className="primary-button" type="button" onClick={() => setIsAboutOpen(false)}>
              {t.commonClose}
            </button>
          </div>
        </div>
      )}

      {isCloseConfirmOpen && (
        <div className="about-backdrop" role="presentation" onMouseDown={() => setIsCloseConfirmOpen(false)}>
          <div
            ref={closeConfirmDialogRef}
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-confirm-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="close-confirm-title">{t.closeConfirmTitle}</h2>
            <p>{project ? t.closeConfirmBodyNamed(project.name) : t.closeConfirmBodyGeneric}</p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setIsCloseConfirmOpen(false)}>
                {t.commonCancel}
              </button>
              <button className="primary-button" type="button" onClick={closeProject}>
                {t.overviewCloseProject}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
