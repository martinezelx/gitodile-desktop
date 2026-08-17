import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleArrowUp,
  CornerDownLeft,
  GitBranch,
  Info,
  LoaderCircle,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Settings,
  Sun,
  TriangleAlert,
  WrapText,
} from "lucide-react";

import { LANGUAGE_NAMES, useLanguage, type Language, type LanguagePreference } from "../../i18n";
import { localizeAppError } from "../../shared/i18n";
import { autoHideScrollbarProps } from "../../shared/ui";
// The diff viewer owns what these mean; Settings only offers the controls.
import {
  DEFAULT_DIFF_PREFERENCES,
  DIFF_TAB_WIDTHS,
  type DiffPreferences,
  type DiffTabWidth,
} from "../changes";
import {
  LINE_ENDING_CHOICES,
  recommendedLineEndingChoice,
  SETTINGS_SECTIONS,
  settingsSectionLabel,
  type GitDiagnostics,
  type GitLineEndings,
  type GitUpdateStatus,
  type LineEndingChoice,
  type SettingsSection,
  type ThemePreference,
} from "./domain";
import type { SettingsPort } from "./port";
import { settingsPort } from "./tauriAdapter";

const THEME_ICONS: Record<ThemePreference, React.JSX.Element> = {
  system: <Monitor />,
  light: <Sun />,
  dark: <Moon />,
};

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];
const LANGUAGE_ORDER: LanguagePreference[] = ["system", "en", "es"];

/* Deliberately permissive. Git itself accepts almost anything here, so this
   only catches the typo class of mistake — a missing `@` or domain — rather
   than deciding which addresses are real. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Identity = { name: string; email: string };

const EMPTY_IDENTITY: Identity = { name: "", email: "" };

/** Outcome messages carry their tone rather than being rendered with one fixed
 * icon. Both of these states used to report every result — including "couldn't
 * save that" and "couldn't start that" — with a success check or a neutral
 * info glyph, so a failure looked like a confirmation. */
type Notice = { tone: "success" | "neutral" | "warning" | "danger"; message: string };

const NOTICE_ICONS: Record<Notice["tone"], React.JSX.Element> = {
  success: <CheckCircle2 aria-hidden="true" />,
  neutral: <Info aria-hidden="true" />,
  warning: <TriangleAlert aria-hidden="true" />,
  danger: <CircleAlert aria-hidden="true" />,
};

/** Arrow keys move focus between the options of a radio group, with Home and
 * End reaching the ends, so a group is one Tab stop rather than one per option.
 *
 * Focus deliberately does not carry the selection with it. The ARIA radio
 * pattern usually selects as focus moves, which is fine when the choice is free
 * — but one of these groups writes to the user's global Git config on every
 * change, and arrowing past an option is not a decision to change it. Space and
 * Enter activate, which buttons already do.
 *
 * Reads the DOM rather than holding refs: the group is the event target's own
 * container, so this works for any number of options without per-group state. */
function moveFocusWithinRadioGroup(event: React.KeyboardEvent<HTMLDivElement>): void {
  const step =
    event.key === "ArrowDown" || event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : 0;
  const isEnd = event.key === "End";
  if (step === 0 && !isEnd && event.key !== "Home") {
    return;
  }
  const options = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
  );
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  if (options.length === 0 || current < 0) {
    return;
  }
  event.preventDefault();
  const next =
    step !== 0 ? (current + step + options.length) % options.length : isEnd ? options.length - 1 : 0;
  options[next].focus();
}

/** Which option in a group carries the single Tab stop: the selected one, or
 * the first when nothing is selected yet — otherwise a group with no selection
 * (line endings before anything is chosen) would be unreachable by keyboard. */
function isRadioTabStop(isActive: boolean, hasSelection: boolean, index: number): boolean {
  return hasSelection ? isActive : index === 0;
}

/** True when the Git installation is in a state the user has to act on. The
 * dialog header and the rail both surface this, because it is the one setting
 * whose failure blocks the whole app rather than degrading one screen. */
export function isGitInstallationBroken(diagnostics: GitDiagnostics | null): boolean {
  return diagnostics !== null && diagnostics.state !== "available";
}

export function SettingsPanel({
  theme,
  setTheme,
  activeSection,
  onSectionChange,
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
  diffPreferences,
  setDiffPreferences,
  defaults,
  project = null,
  onClose,
  onRegisterCloseGuard,
  port = settingsPort,
}: {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
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
  diffPreferences: DiffPreferences;
  setDiffPreferences: (update: (previous: DiffPreferences) => DiffPreferences) => void;
  /** The app owns the seed values for the stored preferences, so "reset this
   * section" gets them from the same place the hooks do rather than keeping a
   * second copy here that could drift. */
  defaults: { reopenLastProject: boolean; confirmCloseProject: boolean };
  /** The open project, when there is one. Only the line-ending group uses it,
   * and only to say whether that project overrides the global answer; with no
   * project open the panel reports the global setting alone. */
  project?: { path: string; sessionEpoch: string } | null;
  onClose?: () => void;
  /** The panel holds the identity draft, so it is the only place that can know
   * whether dismissing the dialog would throw typed input away. It hands the
   * shell a guard rather than the shell reaching in for the draft. */
  onRegisterCloseGuard?: (guard: (() => boolean) | null) => void;
  port?: SettingsPort;
}): React.JSX.Element {
  const { t, languagePreference, setLanguagePreference } = useLanguage();
  const [gitActionNotice, setGitActionNotice] = useState<Notice | null>(null);
  const [savedIdentity, setSavedIdentity] = useState<Identity>(EMPTY_IDENTITY);
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [identityNotice, setIdentityNotice] = useState<Notice | null>(null);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [hasVisitedEmail, setHasVisitedEmail] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const [isStartingGitInstallation, setIsStartingGitInstallation] = useState(false);
  const [isStartingGitUpdate, setIsStartingGitUpdate] = useState(false);
  const [lineEndings, setLineEndings] = useState<GitLineEndings | null>(null);
  const [lineEndingNotice, setLineEndingNotice] = useState<Notice | null>(null);
  const [isSavingLineEndings, setIsSavingLineEndings] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    port
      .getIdentity()
      .then((result) => {
        const identity = { name: result.name ?? "", email: result.email ?? "" };
        setSavedIdentity(identity);
        setNameInput(identity.name);
        setEmailInput(identity.email);
      })
      .catch(() => undefined);
  }, [port]);

  useEffect(() => {
    if (isConfirmingDiscard) {
      keepEditingRef.current?.focus();
    }
  }, [isConfirmingDiscard]);

  /* Read from the primitives rather than the object so a parent re-render with
     a fresh `{ path, sessionEpoch }` literal doesn't re-run the read. */
  const projectPath = project?.path ?? null;
  const projectEpoch = project?.sessionEpoch ?? null;
  const readLineEndings = useCallback((): Promise<GitLineEndings> => {
    return port.readLineEndings(
      projectPath !== null && projectEpoch !== null && projectEpoch !== ""
        ? { path: projectPath, sessionEpoch: projectEpoch }
        : null,
    );
  }, [port, projectEpoch, projectPath]);

  useEffect(() => {
    let isCurrent = true;
    readLineEndings()
      .then((result) => {
        if (isCurrent) {
          setLineEndings(result);
        }
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [readLineEndings]);

  const chooseLineEnding = async (choice: LineEndingChoice): Promise<void> => {
    setLineEndingNotice(null);
    setIsSavingLineEndings(true);
    try {
      await port.setLineEndings(choice);
      // Read back rather than assume: a project that overrides the global
      // config still overrides it after the write, and saying otherwise would
      // report a setting that isn't the one applying here.
      setLineEndings(await readLineEndings());
      setLineEndingNotice({ tone: "success", message: t.lineEndingsSaved });
    } catch (error) {
      setLineEndingNotice({
        tone: "danger",
        message: localizeAppError(error, t, t.lineEndingsCouldntSave),
      });
    } finally {
      setIsSavingLineEndings(false);
    }
  };

  const trimmedName = nameInput.trim();
  const trimmedEmail = emailInput.trim();
  const isIdentityDirty = trimmedName !== savedIdentity.name || trimmedEmail !== savedIdentity.email;
  const hasEmailFormatError = trimmedEmail !== "" && !EMAIL_PATTERN.test(trimmedEmail);
  const canSaveIdentity =
    isIdentityDirty && trimmedName !== "" && trimmedEmail !== "" && !hasEmailFormatError;

  const commitIdentity = useCallback(async (): Promise<boolean> => {
    const identity = { name: nameInput.trim(), email: emailInput.trim() };
    setIdentityNotice(null);
    setIsSavingIdentity(true);
    try {
      await port.setIdentity(identity);
      setSavedIdentity(identity);
      setNameInput(identity.name);
      setEmailInput(identity.email);
      setIdentityNotice({ tone: "success", message: t.identitySaved });
      return true;
    } catch (error) {
      setIdentityNotice({ tone: "danger", message: localizeAppError(error, t, t.identityCouldntSave) });
      return false;
    } finally {
      setIsSavingIdentity(false);
    }
  }, [emailInput, nameInput, port, t]);

  /* The guard is registered once and reads the current draft through a ref.
     Re-registering per keystroke would be correct but pointless churn, and
     the shell stores it in a ref anyway. */
  const guardImplementationRef = useRef<() => boolean>(() => false);
  guardImplementationRef.current = () => {
    if (!isIdentityDirty) {
      return false;
    }
    if (canSaveIdentity) {
      void commitIdentity().then((saved) => {
        if (saved) {
          onClose?.();
        }
      });
      return true;
    }
    onSectionChange("git");
    setHasVisitedEmail(true);
    setIsConfirmingDiscard(true);
    return true;
  };

  useEffect(() => {
    onRegisterCloseGuard?.(() => guardImplementationRef.current());
    return () => onRegisterCloseGuard?.(null);
  }, [onRegisterCloseGuard]);

  const handleIdentityBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setHasVisitedEmail(true);
    if (canSaveIdentity) {
      void commitIdentity();
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    const next =
      step !== 0
        ? (index + step + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? SETTINGS_SECTIONS.length - 1
            : -1;
    if (next < 0) {
      return;
    }
    event.preventDefault();
    onSectionChange(SETTINGS_SECTIONS[next]);
    tabRefs.current[next]?.focus();
  };

  const handleInstallGit = async (): Promise<void> => {
    setGitActionNotice(null);
    setIsStartingGitInstallation(true);
    try {
      const result = await port.installGit();
      if (result.guidanceUrl) {
        await port.openGuidance(result.guidanceUrl);
      }
      switch (result.outcome) {
        case "started":
          setGitActionNotice({ tone: "success", message: t.gitInstallerLaunched });
          break;
        case "guidance":
          setGitActionNotice({
            tone: "neutral",
            message:
              result.platform === "macos"
                ? t.gitMacosGuidanceOpened
                : result.platform === "linux"
                  ? t.gitLinuxGuidanceOpened
                  : t.gitWindowsGuidanceOpened,
          });
          break;
        case "already_starting":
          setGitActionNotice({ tone: "neutral", message: t.gitInstallerAlreadyStarting });
          break;
        case "failed":
          setGitActionNotice({
            tone: "danger",
            message: result.guidanceUrl ? t.gitInstallerFailedWithGuidance : t.gitCouldntStart,
          });
          break;
      }
    } catch {
      setGitActionNotice({ tone: "danger", message: t.gitCouldntStart });
    } finally {
      setIsStartingGitInstallation(false);
    }
  };

  const handleUpdateGit = async (): Promise<void> => {
    setGitActionNotice(null);
    setIsStartingGitUpdate(true);
    try {
      const result = await port.updateGit();
      switch (result.outcome) {
        case "started":
          setGitActionNotice({ tone: "success", message: t.gitUpdateLaunched });
          break;
        case "already_starting":
          setGitActionNotice({ tone: "neutral", message: t.gitUpdateAlreadyStarting });
          break;
        case "unavailable":
          setGitActionNotice({ tone: "warning", message: t.gitUpdateCheckerUnavailable });
          break;
        case "failed":
          setGitActionNotice({ tone: "danger", message: t.gitCouldntStart });
          break;
      }
    } catch {
      setGitActionNotice({ tone: "danger", message: t.gitCouldntStart });
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

  /* Read once per mount, like the About dialog does: the platform cannot
     change while the app is running. */
  const [platform] = useState(() => port.readPlatform());
  const recommendedChoice = recommendedLineEndingChoice(platform);
  const lineEndingText: Record<LineEndingChoice, { label: string; description: string }> = {
    windows_checkout: {
      label: t.lineEndingsWindowsLabel,
      description: t.lineEndingsWindowsDescription,
    },
    normalize: { label: t.lineEndingsNormalizeLabel, description: t.lineEndingsNormalizeDescription },
    keep_as_is: { label: t.lineEndingsKeepLabel, description: t.lineEndingsKeepDescription },
  };
  /* Both of these overrule the choice above for at least some files, so they
     share one warning block instead of arriving as separate pills in different
     tones — the reader has one exception to take in, not two notices to rank. */
  const lineEndingCaveats: Array<{ key: string; text: string }> =
    lineEndings === null
      ? []
      : [
          ...(lineEndings.projectAttributes
            ? [{ key: "attributes", text: t.lineEndingsProjectAttributes }]
            : []),
          ...(lineEndings.eol !== null && lineEndings.eol !== ""
            ? [{ key: "eol", text: `${t.lineEndingsEolNote} ${lineEndings.eol}` }]
            : []),
        ];
  const lineEndingSourceSentence =
    lineEndings === null
      ? null
      : lineEndings.source === "project"
        ? t.lineEndingsFromProject
        : lineEndings.source === "global"
          ? t.lineEndingsFromGlobal
          : t.lineEndingsFromNowhere;

  const SECTION_ICONS: Record<SettingsSection, React.JSX.Element> = {
    general: <Settings />,
    appearance: <Palette />,
    reading: <WrapText />,
    git: <GitBranch />,
    "line-endings": <CornerDownLeft />,
  };
  const sections = SETTINGS_SECTIONS.map((id) => ({
    id,
    label: settingsSectionLabel(id, t),
    icon: SECTION_ICONS[id],
  }));
  const needsGitAttention = isGitInstallationBroken(gitDiagnostics);

  /* Only the sections whose controls have a defined default get the action.
     Git has none: an installed version and an identity are facts about the
     machine, not preferences with a factory setting to return to. */
  const sectionReset: { isAtDefault: boolean; reset: () => void } | null =
    activeSection === "general"
      ? {
          isAtDefault:
            reopenLastProject === defaults.reopenLastProject &&
            confirmCloseProject === defaults.confirmCloseProject,
          reset: () => {
            setReopenLastProject(defaults.reopenLastProject);
            setConfirmCloseProject(defaults.confirmCloseProject);
          },
        }
      : activeSection === "appearance"
        ? {
            isAtDefault: theme === "system" && languagePreference === "system",
            reset: () => {
              setTheme("system");
              setLanguagePreference("system");
            },
          }
        : activeSection === "reading"
          ? {
              isAtDefault: (Object.keys(DEFAULT_DIFF_PREFERENCES) as Array<keyof DiffPreferences>).every(
                (key) => diffPreferences[key] === DEFAULT_DIFF_PREFERENCES[key],
              ),
              reset: () => setDiffPreferences(() => DEFAULT_DIFF_PREFERENCES),
            }
          : null;

  return (
    <div className="settings-layout">
      <div className="settings-nav" role="tablist" aria-orientation="vertical" aria-label={t.settingsSectionsAriaLabel}>
        {sections.map((section, index) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`settings-tab-${section.id}`}
              aria-selected={isActive}
              aria-controls={isActive ? "settings-panel" : undefined}
              /* Roving tabindex: one Tab stop for the whole rail, arrows to
                 move inside it. Without it, reaching the panel took as many
                 Tab presses as there are sections. */
              tabIndex={isActive ? 0 : -1}
              data-autofocus={isActive ? "" : undefined}
              className={`settings-nav__item${isActive ? " settings-nav__item--active" : ""}`}
              onClick={() => onSectionChange(section.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
              {section.id === "git" && needsGitAttention && (
                <span className="settings-nav__alert" role="img" aria-label={t.settingsGitNeedsAttention} />
              )}
            </button>
          );
        })}
      </div>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="settings-view auto-hide-scrollbar"
        role="tabpanel"
        id="settings-panel"
        aria-labelledby={`settings-tab-${activeSection}`}
        tabIndex={0}
      >
        {activeSection === "general" && (
          <div className="settings-groups">
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsStartupTitle}</h3>
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
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsSafetyTitle}</h3>
              </header>
              <div className="settings-group__body">
                <div className="settings-row">
                  <div>
                    <strong>{t.safetyConfirmLabel}</strong>
                    <p>{t.safetyConfirmDescription}</p>
                  </div>
                  <ToggleSwitch label={t.safetyConfirmLabel} checked={confirmCloseProject} onChange={setConfirmCloseProject} />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === "appearance" && (
          <div className="settings-groups">
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.themeAriaLabel}</h3>
                <p>{t.settingsThemeDescription}</p>
              </header>
              <div className="settings-group__body">
                <div
                  className="segmented-control"
                  role="radiogroup"
                  aria-label={t.themeAriaLabel}
                  onKeyDown={moveFocusWithinRadioGroup}
                >
                  {THEME_ORDER.map((option, index) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={theme === option}
                      tabIndex={isRadioTabStop(theme === option, true, index) ? 0 : -1}
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
                <div
                  className="segmented-control"
                  role="radiogroup"
                  aria-label={t.languageAriaLabel}
                  onKeyDown={moveFocusWithinRadioGroup}
                >
                  {LANGUAGE_ORDER.map((option, index) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={languagePreference === option}
                      tabIndex={isRadioTabStop(languagePreference === option, true, index) ? 0 : -1}
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
        )}

        {activeSection === "reading" && (
          <div className="settings-groups">
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsReadingDiffsTitle}</h3>
                <p>{t.settingsReadingDescription}</p>
              </header>
              <div className="settings-group__body">
                <div className="settings-row">
                  <div>
                    <strong>{t.readingWrapLabel}</strong>
                    <p>{t.readingWrapDescription}</p>
                  </div>
                  <ToggleSwitch
                    label={t.readingWrapLabel}
                    checked={diffPreferences.wrapLines}
                    onChange={(wrapLines) => setDiffPreferences((previous) => ({ ...previous, wrapLines }))}
                  />
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t.readingIgnoreWhitespaceLabel}</strong>
                    <p>{t.readingIgnoreWhitespaceDescription}</p>
                  </div>
                  <ToggleSwitch
                    label={t.readingIgnoreWhitespaceLabel}
                    checked={diffPreferences.ignoreWhitespace}
                    onChange={(ignoreWhitespace) =>
                      setDiffPreferences((previous) => ({ ...previous, ignoreWhitespace }))
                    }
                  />
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t.readingSyntaxLabel}</strong>
                    <p>{t.readingSyntaxDescription}</p>
                  </div>
                  <ToggleSwitch
                    label={t.readingSyntaxLabel}
                    checked={diffPreferences.syntaxHighlighting}
                    onChange={(syntaxHighlighting) =>
                      setDiffPreferences((previous) => ({ ...previous, syntaxHighlighting }))
                    }
                  />
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t.readingTabWidthLabel}</strong>
                    <p>{t.readingTabWidthDescription}</p>
                  </div>
                  <div
                    className="segmented-control"
                    role="radiogroup"
                    aria-label={t.readingTabWidthLabel}
                    onKeyDown={moveFocusWithinRadioGroup}
                  >
                    {DIFF_TAB_WIDTHS.map((width: DiffTabWidth, index: number) => (
                      <button
                        key={width}
                        type="button"
                        role="radio"
                        aria-checked={diffPreferences.tabWidth === width}
                        tabIndex={isRadioTabStop(diffPreferences.tabWidth === width, true, index) ? 0 : -1}
                        className={`segmented-control__option${diffPreferences.tabWidth === width ? " segmented-control__option--active" : ""}`}
                        onClick={() => setDiffPreferences((previous) => ({ ...previous, tabWidth: width }))}
                      >
                        {width}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === "git" && (
          <div className="settings-groups">
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsGitInstallationTitle}</h3>
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
                    {gitActionNotice && (
                      <p className={`git-install__status git-install__status--${gitActionNotice.tone}`} role="status">
                        {NOTICE_ICONS[gitActionNotice.tone]}
                        <span>{gitActionNotice.message}</span>
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
              {/* Saved when focus leaves the pair, not behind a Save button:
                  every other control here applies on change, and the button
                  was the only thing standing between a typed name and a
                  dismissed dialog. */}
              <div className="settings-group__body identity-block" onBlur={handleIdentityBlur}>
                <div className="identity-fields">
                  <label className="text-field">
                    <span>{t.identityNameLabel}</span>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(event) => {
                        setNameInput(event.target.value);
                        setIsConfirmingDiscard(false);
                      }}
                      placeholder={t.identityNamePlaceholder}
                    />
                  </label>
                  <label className="text-field">
                    <span>{t.identityEmailLabel}</span>
                    <input
                      type="email"
                      value={emailInput}
                      aria-invalid={hasVisitedEmail && hasEmailFormatError}
                      aria-describedby={hasVisitedEmail && hasEmailFormatError ? "identity-email-error" : undefined}
                      onChange={(event) => {
                        setEmailInput(event.target.value);
                        setIsConfirmingDiscard(false);
                      }}
                      placeholder={t.identityEmailPlaceholder}
                    />
                  </label>
                </div>
                <div className="identity-block__status" role="status">
                  {hasVisitedEmail && hasEmailFormatError ? (
                    <p id="identity-email-error" className="settings-row__hint settings-row__hint--danger">
                      <TriangleAlert aria-hidden="true" />
                      <span>{t.identityInvalidEmail}</span>
                    </p>
                  ) : isSavingIdentity ? (
                    <p className="settings-row__hint">
                      <LoaderCircle aria-hidden="true" className="icon--spinning" />
                      <span>{t.settingsSaving}</span>
                    </p>
                  ) : identityNotice ? (
                    <p className={`settings-row__hint settings-row__hint--${identityNotice.tone}`}>
                      {NOTICE_ICONS[identityNotice.tone]}
                      <span>{identityNotice.message}</span>
                    </p>
                  ) : null}
                </div>
                {isConfirmingDiscard && (
                  <div className="identity-block__confirm" role="alert">
                    <div>
                      <strong>{t.identityUnsavedTitle}</strong>
                      <p>{t.identityUnsavedBody}</p>
                    </div>
                    <div className="settings-row__actions">
                      <button className="secondary-button" type="button" onClick={() => onClose?.()}>
                        {t.identityDiscardAndClose}
                      </button>
                      <button
                        ref={keepEditingRef}
                        className="primary-button"
                        type="button"
                        onClick={() => setIsConfirmingDiscard(false)}
                      >
                        {t.identityKeepEditing}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeSection === "line-endings" && (
          <div className="settings-groups">
            <section className="settings-group">
              {/* No `h3` here: the rail already says "Line endings" and this is
                  the section's only group, so a heading would repeat it — the
                  redundant heading layer task 057 removed. */}
              <header className="settings-group__header">
                <p>{t.settingsLineEndingsDescription}</p>
              </header>
              <div className="settings-group__body">
                {lineEndings === null ? (
                  <p className="settings-row__hint">
                    <LoaderCircle aria-hidden="true" className="icon--spinning" />
                    <span>{t.settingsGeneralChecking}</span>
                  </p>
                ) : (
                  <>
                    {/* Each option is a full sentence about what happens to
                        files, so they stack rather than sharing a segmented
                        control: the wording is the point of this group. */}
                    <div
                      className="line-endings"
                      role="radiogroup"
                      aria-label={t.settingsLineEndingsTitle}
                      onKeyDown={moveFocusWithinRadioGroup}
                    >
                      {LINE_ENDING_CHOICES.map((choice, index) => {
                        const isActive = lineEndings.mode === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            tabIndex={
                              isRadioTabStop(isActive, lineEndings.mode !== "not_set", index) ? 0 : -1
                            }
                            disabled={isSavingLineEndings}
                            className={`line-endings__option${isActive ? " line-endings__option--active" : ""}`}
                            onClick={() => void chooseLineEnding(choice)}
                          >
                            <span className="line-endings__option-label">
                              {lineEndingText[choice].label}
                              {choice === recommendedChoice && (
                                <span className="line-endings__recommended">{t.lineEndingsRecommended}</span>
                              )}
                            </span>
                            <span className="line-endings__option-description">
                              {lineEndingText[choice].description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Three competing boxes used to sit here: a label with the
                        chosen option's name repeated verbatim from the card
                        above it, then an info pill, then a warning pill of a
                        different width. The selected card already states what
                        is in effect, so this is one quiet line of provenance
                        and — only when there is one — a single caveat block for
                        the things that overrule the choice. */}
                    <div className="line-endings__status">
                      <p className="line-endings__source">{lineEndingSourceSentence}</p>
                      {lineEndingCaveats.length > 0 && (
                        <div className="line-endings__caveat">
                          <TriangleAlert aria-hidden="true" />
                          <div>
                            {lineEndingCaveats.map((caveat) => (
                              <p key={caveat.key}>{caveat.text}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      <div role="status">
                        {isSavingLineEndings ? (
                          <p className="settings-row__hint">
                            <LoaderCircle aria-hidden="true" className="icon--spinning" />
                            <span>{t.settingsSaving}</span>
                          </p>
                        ) : lineEndingNotice ? (
                          <p className={`settings-row__hint settings-row__hint--${lineEndingNotice.tone}`}>
                            {NOTICE_ICONS[lineEndingNotice.tone]}
                            <span>{lineEndingNotice.message}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        )}
        {sectionReset && (
          <div className="settings-view__footer">
            <button
              className="secondary-button settings-reset"
              type="button"
              disabled={sectionReset.isAtDefault}
              onClick={sectionReset.reset}
            >
              <RotateCcw aria-hidden="true" />
              {t.settingsResetSection}
            </button>
          </div>
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
