import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleArrowUp,
  CloudDownload,
  CornerDownLeft,
  GitBranch,
  GripVertical,
  Info,
  LoaderCircle,
  PanelLeft,
  Palette,
  Settings,
  TriangleAlert,
  WrapText,
} from "lucide-react";

import { LANGUAGE_NAMES, useLanguage, type Language, type LanguagePreference } from "../../i18n";
import {
  DATE_FORMATS,
  FORMAT_SAMPLE_DATE,
  FORMAT_SAMPLE_NUMBER,
  NUMBER_FORMATS,
  formatDate,
  formatNumber,
  localizeAppError,
  type DateFormatPreference,
  type NumberFormatPreference,
} from "../../shared/i18n";
import { autoHideScrollbarProps, moveFocusWithinRadioGroup, ToggleSwitch } from "../../shared/ui";
import {
  COMMUNITY_THEMES,
  OFFICIAL_THEMES,
  type ThemeId,
  type ThemePreference,
} from "../../shared/theme";
import { useInstallDraftBlocker } from "../../runtime/drafts";
// The diff viewer owns what these mean; Settings only offers the controls.
import {
  DIFF_CODE_FONTS,
  DIFF_CODE_FONT_STACKS,
  DIFF_TAB_WIDTHS,
  type DiffCodeFont,
  type DiffPreferences,
  type DiffTabWidth,
} from "../changes";
import {
  DEFAULT_BRANCH_FALLBACK,
  DEFAULT_BRANCH_SUGGESTIONS,
  LINE_ENDING_CHOICES,
  REMOTE_CHECK_MAX_MINUTES,
  REMOTE_CHECK_MIN_MINUTES,
  REMOTE_CHECK_PRESETS,
  REMOTE_CHECK_UNITS,
  combineRemoteCheckInterval,
  isRemoteCheckPreset,
  recommendedLineEndingChoice,
  SETTINGS_SECTIONS,
  settingsSectionLabel,
  splitRemoteCheckInterval,
  type GitDiagnostics,
  type GitUpdateStatus,
  type LineEndingChoice,
  type NavigationDisplayMode,
  type NavigationPreferences,
  type RemoteCheckIntervalMinutes,
  type RemoteCheckUnit,
  type SettingsSection,
} from "./domain";
import { NOTIFICATION_ICONS, NOTIFICATION_KINDS, type NotificationKind } from "../notifications";
import type { SettingsPort } from "./port";
import { settingsPort } from "./tauriAdapter";
import type { DefaultBranchState, GitIdentityState, LineEndingsState } from "./useGitConfig";

/** A miniature of the app drawn in a theme's own tokens. `data-theme` scopes
 * the palette to this subtree, so the preview shows the real thing rather than
 * a swatch. The mark and the action keep the brand layer, as they do in the
 * app. */
function ThemePreview({ theme }: { theme: ThemeId }): React.JSX.Element {
  return (
    <span className="theme-preview" data-theme={theme}>
      <span className="theme-preview__rail">
        <span className="theme-preview__mark" />
        <span className="theme-preview__nav theme-preview__nav--active" />
        <span className="theme-preview__nav" />
        <span className="theme-preview__nav" />
      </span>
      <span className="theme-preview__main">
        <span className="theme-preview__bar">
          <span className="theme-preview__file" />
          <span className="theme-preview__cta" />
        </span>
        <span className="theme-preview__line" />
        <span className="theme-preview__line theme-preview__line--add" />
        <span className="theme-preview__line theme-preview__line--del" />
      </span>
    </span>
  );
}

/** One option in the theme picker: "match device" or a real theme, with its
 * preview and the scheme's words for the accessible name. */
type ThemeCardOption = {
  id: ThemePreference;
  name: string;
  schemeLabel: string;
  /** Official GitOdile records wear the brand mark so the three stand apart. */
  branded: boolean;
  preview: React.JSX.Element;
};

/* The characters a monospaced font is actually chosen for: zero against
   capital O, one against lowercase l and capital I, and the punctuation a diff
   turns on. Rendered at the diff's own size, so the sample is the thing the
   reader will get rather than a flattering enlargement. */
const CODE_FONT_SAMPLE = "0O 1lI {}[] != =>";

/** Static: nothing about the rail's icons depends on state, a preference or the
 * language. */
const SECTION_ICONS: Record<SettingsSection, React.JSX.Element> = {
  general: <Settings />,
  notifications: <Bell />,
  appearance: <Palette />,
  navigation: <PanelLeft />,
  reading: <WrapText />,
  git: <GitBranch />,
  "line-endings": <CornerDownLeft />,
  updates: <CloudDownload />,
};

/** The three kinds the centre records, in the order the panel shows them: the
 * two background events first, the receipt last.
 *
 * Only the translation keys live here. The glyph and the tone are read from the
 * notifications feature itself, because the copy beside these rows tells the
 * reader in so many words that these are the icons the notification will wear —
 * a second table here would let that go quietly false. */
const NOTIFICATION_EVENT_ROWS = [
  {
    kind: "teamChangesAvailable",
    label: "notificationsEventTeamChangesLabel",
    description: "notificationsEventTeamChangesDescription",
  },
  {
    kind: "remoteCheckFailed",
    label: "notificationsEventCheckFailedLabel",
    description: "notificationsEventCheckFailedDescription",
  },
  {
    kind: "appUpdateAvailable",
    label: "notificationsEventAppUpdateLabel",
    description: "notificationsEventAppUpdateDescription",
  },
  {
    kind: "changesPublished",
    label: "notificationsEventPublishedLabel",
    description: "notificationsEventPublishedDescription",
  },
  /* `as const` keeps the translation keys as literal types, so `t[label]` is
     checked against the dictionary rather than indexed with a bare string;
     `satisfies` keeps `kind` honest against the union it names. */
] as const satisfies ReadonlyArray<{
  kind: NotificationKind;
  label: string;
  description: string;
}>;

const LANGUAGE_ORDER: LanguagePreference[] = ["system", "en", "es"];

/* Deliberately permissive. Git itself accepts almost anything here, so this
   only catches the typo class of mistake — a missing `@` or domain — rather
   than deciding which addresses are real. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Which option in a group carries the single Tab stop: the selected one, or
 * the first when nothing is selected yet — otherwise a group with no selection
 * (line endings before anything is chosen) would be unreachable by keyboard. */
function isRadioTabStop(isActive: boolean, hasSelection: boolean, index: number): boolean {
  return hasSelection ? isActive : index === 0;
}

/** The section rail, memoized away from the panel body.
 *
 * The panel re-renders on every keystroke in the identity field — the draft
 * lives there because it has to survive switching sections, and the close
 * guard reads it from wherever the user is. None of that touches the rail, so
 * it is skipped instead of rebuilt: its props are the section list (memoized
 * on the language), the active id, one boolean, and a setter React keeps
 * stable.
 *
 * `tabRefs` and the arrow-key handler moved in with it. Left in the panel,
 * the handler would be a fresh function on every render and defeat the memo. */
const SettingsNav = React.memo(function SettingsNav({
  sections,
  activeSection,
  onSectionChange,
  needsGitAttention,
  updateAttention,
  railLabel,
  attentionLabel,
}: {
  sections: Array<{
    id: SettingsSection;
    label: string;
    icon: React.JSX.Element;
  }>;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  needsGitAttention: boolean;
  /** An update waiting to be downloaded or installed, named for the badge's
   * accessible name — or null when the rail has nothing to point at. */
  updateAttention: string | null;
  railLabel: string;
  attentionLabel: string;
}): React.JSX.Element {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
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

  return (
    <div className="settings-nav" role="tablist" aria-orientation="vertical" aria-label={railLabel}>
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
            aria-controls="settings-panel"
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
              <span className="settings-nav__alert" role="img" aria-label={attentionLabel}>
                <CircleAlert aria-hidden="true" />
              </span>
            )}
            {/* Good news, not an alarm: the accent, in the same slot Git's
                warning uses, so the rail has one place for "look here". */}
            {section.id === "updates" && updateAttention && (
              <span className="settings-nav__alert settings-nav__alert--accent" role="img" aria-label={updateAttention}>
                <CircleArrowUp aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

/** True when the Git installation is in a state the user has to act on. The
 * dialog header and the rail both surface this, because it is the one setting
 * whose failure blocks the whole app rather than degrading one screen. */
export function isGitInstallationBroken(diagnostics: GitDiagnostics | null): boolean {
  return diagnostics !== null && diagnostics.state !== "available";
}

export function SettingsPanel({
  theme,
  setTheme,
  reducedMotion,
  setReducedMotion,
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
  watchProjects,
  setWatchProjects,
  remoteCheckInterval,
  setRemoteCheckInterval,
  confirmDiscard,
  setConfirmDiscard,
  notificationsEnabled,
  setNotificationsEnabled,
  runGitHooks,
  setRunGitHooks,
  navigationItems,
  navigationPreferences,
  setNavigationPreferences,
  diffPreferences,
  setDiffPreferences,
  identity,
  defaultBranch,
  lineEndingsState,
  applicationUpdates,
  applicationUpdateAttention = null,
  onClose,
  onRegisterCloseGuard,
  port = settingsPort,
}: {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
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
  watchProjects: boolean;
  setWatchProjects: (value: boolean) => void;
  remoteCheckInterval: RemoteCheckIntervalMinutes;
  setRemoteCheckInterval: (value: RemoteCheckIntervalMinutes) => void;
  confirmDiscard: boolean;
  setConfirmDiscard: (value: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => void;
  runGitHooks: boolean;
  setRunGitHooks: (value: boolean) => void;
  navigationItems: Array<{ id: string; label: string; icon: React.JSX.Element }>;
  navigationPreferences: NavigationPreferences;
  setNavigationPreferences: (
    update: (previous: NavigationPreferences) => NavigationPreferences,
  ) => void;
  diffPreferences: DiffPreferences;
  setDiffPreferences: (update: (previous: DiffPreferences) => DiffPreferences) => void;
  /** Both reads live above the dialog, which the shell unmounts on close, so
   * the values survive a closing instead of being fetched again. The panel
   * still owns the draft, the notices and the close guard: those are the parts
   * that genuinely belong to one opening. */
  identity: GitIdentityState;
  defaultBranch: DefaultBranchState;
  lineEndingsState: LineEndingsState;
  /** Feature-owned application update controls: the whole body of the
   * Updates section, which the app-updates feature renders and this panel
   * only places. */
  applicationUpdates?: React.ReactNode;
  /** Set while an update is waiting to be downloaded or installed; the rail
   * badges the Updates section with it. */
  applicationUpdateAttention?: string | null;
  onClose?: () => void;
  /** The panel holds the identity draft, so it is the only place that can know
   * whether dismissing the dialog would throw typed input away. It hands the
   * shell a guard rather than the shell reaching in for the draft. */
  onRegisterCloseGuard?: (guard: (() => boolean) | null) => void;
  port?: SettingsPort;
}): React.JSX.Element {
  const { t, languagePreference, setLanguagePreference, formats, setDateFormat, setNumberFormat } =
    useLanguage();
  const [gitActionNotice, setGitActionNotice] = useState<Notice | null>(null);
  const [nameInput, setNameInput] = useState(identity.identity.name);
  const [emailInput, setEmailInput] = useState(identity.identity.email);
  const [identityNotice, setIdentityNotice] = useState<Notice | null>(null);
  const [hasVisitedEmail, setHasVisitedEmail] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const [isStartingGitInstallation, setIsStartingGitInstallation] = useState(false);
  const [isStartingGitUpdate, setIsStartingGitUpdate] = useState(false);
  const [lineEndingNotice, setLineEndingNotice] = useState<Notice | null>(null);
  const [defaultBranchNotice, setDefaultBranchNotice] = useState<Notice | null>(null);
  const [remoteCheckNotice, setRemoteCheckNotice] = useState<string | null>(null);
  const [draggedNavigationId, setDraggedNavigationId] = useState<string | null>(null);
  const [dragOverNavigationId, setDragOverNavigationId] = useState<string | null>(null);
  const [navigationOrderNotice, setNavigationOrderNotice] = useState("");
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  const savedIdentity = identity.identity;
  const isSavingIdentity = identity.isSaving;
  const { lineEndings, isSaving: isSavingLineEndings } = lineEndingsState;

  /* The draft is seeded from the saved identity, which the `useState` calls
     above already do whenever the read has answered before this panel mounted
     — the normal case, since the read starts at app startup and the panel is
     built on demand. This covers only the first open of a cold session, where
     the dialog can be on screen before the answer arrives.
     Adjusting state during render rather than in an effect: React re-renders
     before committing, so the fields never paint empty and then fill in. It
     runs at most once, because the flag is only ever set. */
  const [hasSeededDraft, setHasSeededDraft] = useState(identity.isLoaded);
  if (identity.isLoaded && !hasSeededDraft) {
    setHasSeededDraft(true);
    setNameInput(savedIdentity.name);
    setEmailInput(savedIdentity.email);
  }

  useEffect(() => {
    if (isConfirmingDiscard) {
      keepEditingRef.current?.focus();
    }
  }, [isConfirmingDiscard]);

  const chooseLineEnding = async (choice: LineEndingChoice): Promise<void> => {
    setLineEndingNotice(null);
    try {
      await lineEndingsState.choose(choice);
      setLineEndingNotice({ tone: "success", message: t.lineEndingsSaved });
    } catch (error) {
      setLineEndingNotice({
        tone: "danger",
        message: localizeAppError(error, t, t.lineEndingsCouldntSave),
      });
    }
  };

  /* The custom cadence is a draft while it is being typed, exactly like the
     identity fields: an interval is only stored once it is one this app will
     actually run, so a half-typed "5" on the way to "50" never becomes the
     live cadence and a rejected value keeps showing what was typed. */
  const storedCadence = splitRemoteCheckInterval(
    remoteCheckInterval === 0 ? REMOTE_CHECK_PRESETS[1] : remoteCheckInterval,
  );
  const [isCustomCadenceOpen, setIsCustomCadenceOpen] = useState(
    remoteCheckInterval !== 0 && !isRemoteCheckPreset(remoteCheckInterval),
  );
  const [cadenceInput, setCadenceInput] = useState(String(storedCadence.value));
  const [cadenceUnit, setCadenceUnit] = useState<RemoteCheckUnit>(storedCadence.unit);

  const cadenceRangeMessage = t.remoteCheckOutOfRange(
    t.remoteCheckMinutesUnit(REMOTE_CHECK_MIN_MINUTES),
    t.remoteCheckHoursUnit(REMOTE_CHECK_MAX_MINUTES / 60),
  );

  const applyCustomCadence = (value: string, unit: RemoteCheckUnit): void => {
    const parsed = Number(value.trim());
    const minutes =
      value.trim() === "" || !Number.isInteger(parsed)
        ? null
        : combineRemoteCheckInterval(parsed, unit);
    if (minutes === null) {
      setRemoteCheckNotice(cadenceRangeMessage);
      return;
    }
    setRemoteCheckNotice(null);
    setRemoteCheckInterval(minutes);
  };

  /* Always the stored cadence, never the draft: while a typed value is out of
     range the previous one is still the one running, and this is the line that
     has to say so. */
  const activeCadenceSentence =
    remoteCheckInterval === 0
      ? t.remoteCheckNever
      : remoteCheckInterval % 60 === 0
        ? t.remoteCheckEveryHours(remoteCheckInterval / 60)
        : t.remoteCheckEveryMinutes(remoteCheckInterval);

  const chooseCadencePreset = (minutes: RemoteCheckIntervalMinutes): void => {
    setIsCustomCadenceOpen(false);
    setRemoteCheckNotice(null);
    setRemoteCheckInterval(minutes);
  };

  const savedDefaultBranch = defaultBranch.name;
  /* With nothing stored, the panel still shows the name new projects will get.
     An empty group reads as "unfinished", and the honest answer is not "no
     name" — it is "main, and not written to Git yet", which the hint says. */
  const shownDefaultBranch = savedDefaultBranch ?? DEFAULT_BRANCH_FALLBACK;
  const isSuggestedDefaultBranch = DEFAULT_BRANCH_SUGGESTIONS.some(
    (suggestion) => suggestion === shownDefaultBranch,
  );
  const [isCustomBranchOpen, setIsCustomBranchOpen] = useState(false);
  const [branchInput, setBranchInput] = useState(savedDefaultBranch ?? "");
  /* Seeded during render for the same reason the identity draft is: on a cold
     session the panel can be on screen before the config read answers, and an
     effect would paint an empty field first and fill it in afterwards. */
  const [hasSeededBranch, setHasSeededBranch] = useState(defaultBranch.isLoaded);
  if (defaultBranch.isLoaded && !hasSeededBranch) {
    setHasSeededBranch(true);
    setBranchInput(savedDefaultBranch ?? "");
  }
  const showsCustomBranch = isCustomBranchOpen || !isSuggestedDefaultBranch;

  /* Committing the typed draft is the group's job, not the field's.
     Saving from the input's own `onBlur` raced the suggestion buttons: blur
     fires before click, so typing "trunk" and then pressing "main" started two
     writes to `init.defaultBranch` at once and whichever landed last won. This
     is the same guard the identity block uses — focus moving to another control
     inside the group means that control decides what is saved. */
  const handleDefaultBranchBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    if (!showsCustomBranch) return;
    void saveDefaultBranch(branchInput);
  };

  const saveDefaultBranch = async (name: string): Promise<void> => {
    const next = name.trim();
    if (next === "" || next === savedDefaultBranch) return;
    setDefaultBranchNotice(null);
    try {
      await defaultBranch.save(next);
      setDefaultBranchNotice({ tone: "success", message: t.defaultBranchSaved });
    } catch (error) {
      setDefaultBranchNotice({
        tone: "danger",
        message: localizeAppError(error, t, t.defaultBranchCouldntSave),
      });
    }
  };

  const trimmedName = nameInput.trim();
  const trimmedEmail = emailInput.trim();
  const isIdentityDirty = trimmedName !== savedIdentity.name || trimmedEmail !== savedIdentity.email;
  const hasEmailFormatError = trimmedEmail !== "" && !EMAIL_PATTERN.test(trimmedEmail);
  const canSaveIdentity =
    isIdentityDirty && trimmedName !== "" && trimmedEmail !== "" && !hasEmailFormatError;
  const parsedCadence = Number(cadenceInput.trim());
  const cadenceDraftMinutes =
    cadenceInput.trim() !== "" && Number.isInteger(parsedCadence)
      ? combineRemoteCheckInterval(parsedCadence, cadenceUnit)
      : null;
  const hasSettingsDraft =
    isIdentityDirty ||
    (showsCustomBranch && branchInput.trim() !== (savedDefaultBranch ?? "")) ||
    (isCustomCadenceOpen && cadenceDraftMinutes !== remoteCheckInterval);
  useInstallDraftBlocker("application-settings", "application settings", hasSettingsDraft);

  const saveIdentity = identity.save;
  const commitIdentity = useCallback(async (): Promise<boolean> => {
    const next = { name: nameInput.trim(), email: emailInput.trim() };
    setIdentityNotice(null);
    try {
      await saveIdentity(next);
      setNameInput(next.name);
      setEmailInput(next.email);
      setIdentityNotice({ tone: "success", message: t.identitySaved });
      return true;
    } catch (error) {
      setIdentityNotice({ tone: "danger", message: localizeAppError(error, t, t.identityCouldntSave) });
      return false;
    }
  }, [emailInput, nameInput, saveIdentity, t]);

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

  /* Each option is named by what it does rather than by its own output: the
     sample beside it is the output, and a label that was only `30/08/2026`
     would be unreadable to anyone using a screen reader. */
  const dateFormatLabels: Record<DateFormatPreference, string> = useMemo(
    () => ({
      system: t.formatsSystem,
      iso: t.formatsDateIso,
      "day-first": t.formatsDateDayFirst,
      "month-first": t.formatsDateMonthFirst,
    }),
    [t],
  );
  const numberFormatLabels: Record<NumberFormatPreference, string> = useMemo(
    () => ({
      system: t.formatsSystem,
      "comma-dot": t.formatsNumberCommaDot,
      "dot-comma": t.formatsNumberDotComma,
      "space-comma": t.formatsNumberSpaceComma,
    }),
    [t],
  );

  /* Read once per mount, like the About dialog does: the platform cannot
     change while the app is running. */
  const [platform] = useState(() => port.readPlatform());
  const recommendedChoice = recommendedLineEndingChoice(platform);
  const lineEndingText: Record<LineEndingChoice, { label: string; description: string }> = useMemo(
    () => ({
      windows_checkout: {
        label: t.lineEndingsWindowsLabel,
        description: t.lineEndingsWindowsDescription,
      },
      normalize: {
        label: t.lineEndingsNormalizeLabel,
        description: t.lineEndingsNormalizeDescription,
      },
      keep_as_is: { label: t.lineEndingsKeepLabel, description: t.lineEndingsKeepDescription },
    }),
    [t],
  );
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

  /* Short names rather than the full family names: the option is rendered in
     the font it names, so the sample does the identifying and a long label
     would only make the group wrap. */
  const CODE_FONT_LABELS: Record<DiffCodeFont, string> = useMemo(
    () => ({
      atkinson: t.readingCodeFontAtkinson,
      jetbrains: t.readingCodeFontJetBrains,
      plex: t.readingCodeFontPlex,
      system: t.readingCodeFontSystem,
    }),
    [t],
  );

  /* Only the labels depend on anything, so only they are recomputed. Built
     inline, this rebuilt five icon elements and the list around them on every
     keystroke in the identity field. */
  const sections = useMemo(
    () =>
      SETTINGS_SECTIONS.map((id) => ({
        id,
        label: settingsSectionLabel(id, t),
        icon: SECTION_ICONS[id],
      })),
    [t],
  );
  const needsGitAttention = isGitInstallationBroken(gitDiagnostics);
  const visibleNavigationIds = new Set(navigationPreferences.visibleDestinationIds);
  const setDestinationVisible = (id: string, isVisible: boolean): void => {
    setNavigationPreferences((previous) => {
      const previousVisible = new Set(previous.visibleDestinationIds);
      if (isVisible) previousVisible.add(id);
      else previousVisible.delete(id);
      return {
        ...previous,
        visibleDestinationIds: navigationItems
          .filter((item) => previousVisible.has(item.id))
          .map((item) => item.id),
      };
    });
  };
  const moveNavigationDestination = (id: string, toIndex: number): void => {
    const availableIds = navigationItems.map((item) => item.id);
    const allowedIds = new Set(availableIds);
    setNavigationPreferences((previous) => {
      const order = Array.from(
        new Set([...previous.destinationOrderIds, ...availableIds]),
      ).filter((destinationId) => allowedIds.has(destinationId));
      const fromIndex = order.indexOf(id);
      if (fromIndex < 0) return previous;
      order.splice(fromIndex, 1);
      order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, id);
      return { ...previous, destinationOrderIds: order };
    });
    const item = navigationItems.find((candidate) => candidate.id === id);
    if (item) {
      setNavigationOrderNotice(
        `${item.label}. ${t.settingsNavigationOrderPosition} ${toIndex + 1} ${t.settingsNavigationOrderOf} ${navigationItems.length}.`,
      );
    }
  };
  const setNavigationDisplayMode = (displayMode: NavigationDisplayMode): void => {
    setNavigationPreferences((previous) => ({ ...previous, displayMode }));
  };

  /* The theme picker's options are built here so the two rows share one card
     renderer and cannot drift. "Match device" is a preference, not a theme, so
     it takes the split preview rather than a record. */
  const themeCardOption = (record: (typeof OFFICIAL_THEMES)[number]): ThemeCardOption => ({
    id: record.id,
    name: record.name,
    schemeLabel: record.scheme === "dark" ? t.themeSchemeDark : t.themeSchemeLight,
    branded: record.source === "official",
    preview: <ThemePreview theme={record.id} />,
  });
  const officialThemeOptions: readonly ThemeCardOption[] = [
    {
      id: "system",
      name: t.themeMatchDevice,
      schemeLabel: t.themeSchemeAuto,
      branded: true,
      preview: (
        <span className="theme-card__split">
          <ThemePreview theme="gitodile-light" />
          <ThemePreview theme="gitodile-dark" />
        </span>
      ),
    },
    ...OFFICIAL_THEMES.map(themeCardOption),
  ];
  const communityThemeOptions: readonly ThemeCardOption[] = COMMUNITY_THEMES.map(themeCardOption);
  const renderThemeCard = (option: ThemeCardOption, index: number): React.JSX.Element => {
    const isSelected = theme === option.id;
    return (
      <button
        key={option.id}
        type="button"
        role="radio"
        aria-checked={isSelected}
        aria-label={`${option.name}, ${option.schemeLabel}`}
        tabIndex={isRadioTabStop(isSelected, true, index) ? 0 : -1}
        className="theme-card"
        onClick={() => setTheme(option.id)}
      >
        {option.branded && (
          <span className="theme-card__brand" aria-hidden="true">
            <span className="gitodile-mark" />
          </span>
        )}
        <span className="theme-card__tile">{option.preview}</span>
        <span className="theme-card__label">
          <span className="theme-card__name">{option.name}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="settings-layout">
      <SettingsNav
        sections={sections}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        needsGitAttention={needsGitAttention}
        updateAttention={applicationUpdateAttention}
        railLabel={t.settingsSectionsAriaLabel}
        attentionLabel={t.settingsGitNeedsAttention}
      />
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
                <h3>{t.settingsWatchingTitle}</h3>
              </header>
              <div className="settings-group__body">
                <div className="settings-row">
                  <div>
                    <strong>{t.watchingLabel}</strong>
                    <p>{t.watchingDescription}</p>
                  </div>
                  <ToggleSwitch label={t.watchingLabel} checked={watchProjects} onChange={setWatchProjects} />
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t.remoteCheckLabel}</strong>
                    <p>{t.remoteCheckDescription}</p>
                  </div>
                  <div
                    className="segmented-control remote-check-cadence"
                    role="radiogroup"
                    aria-label={t.remoteCheckIntervalLabel}
                    onKeyDown={moveFocusWithinRadioGroup}
                  >
                    {REMOTE_CHECK_PRESETS.map((minutes, index) => {
                      const isActive = !isCustomCadenceOpen && remoteCheckInterval === minutes;
                      const fullLabel = minutes === 0
                        ? t.remoteCheckNever
                        : minutes === 60
                          ? t.remoteCheckEveryHour
                          : t.remoteCheckEveryMinutes(minutes);
                      return (
                        <button
                          key={minutes}
                          className={`segmented-control__option${isActive ? " segmented-control__option--active" : ""}`}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          aria-label={fullLabel}
                          tabIndex={isRadioTabStop(isActive, true, index) ? 0 : -1}
                          onClick={() => chooseCadencePreset(minutes)}
                        >
                          {minutes === 0
                            ? t.remoteCheckNever
                            : minutes === 60
                              ? t.remoteCheckHourShort
                              : t.remoteCheckMinutesShort(minutes)}
                        </button>
                      );
                    })}
                    {/* The presets are the common answers, not the only ones.
                        This option opens the field rather than carrying a value
                        of its own, so choosing it changes nothing until a
                        number the app will accept has been typed. */}
                    <button
                      className={`segmented-control__option${isCustomCadenceOpen ? " segmented-control__option--active" : ""}`}
                      type="button"
                      role="radio"
                      aria-checked={isCustomCadenceOpen}
                      aria-label={t.remoteCheckCustom}
                      tabIndex={
                        isRadioTabStop(isCustomCadenceOpen, true, REMOTE_CHECK_PRESETS.length) ? 0 : -1
                      }
                      onClick={() => {
                        setIsCustomCadenceOpen(true);
                        applyCustomCadence(cadenceInput, cadenceUnit);
                      }}
                    >
                      {t.remoteCheckCustomShort}
                    </button>
                  </div>
                </div>
                {isCustomCadenceOpen && (
                  <div className="settings-row settings-row--stacked">
                    <div className="remote-check-custom">
                      <label className="text-field text-field--compact">
                        <span>{t.remoteCheckCustomValueLabel}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={REMOTE_CHECK_MIN_MINUTES}
                          max={
                            cadenceUnit === "hours"
                              ? REMOTE_CHECK_MAX_MINUTES / 60
                              : REMOTE_CHECK_MAX_MINUTES
                          }
                          step={1}
                          value={cadenceInput}
                          aria-invalid={remoteCheckNotice !== null}
                          aria-describedby={
                            remoteCheckNotice === null ? undefined : "remote-check-range-error"
                          }
                          onChange={(event) => {
                            setCadenceInput(event.target.value);
                            applyCustomCadence(event.target.value, cadenceUnit);
                          }}
                        />
                      </label>
                      <div
                        className="segmented-control"
                        role="radiogroup"
                        aria-label={t.remoteCheckCustomUnitLabel}
                        onKeyDown={moveFocusWithinRadioGroup}
                      >
                        {REMOTE_CHECK_UNITS.map((unit, index) => (
                          <button
                            key={unit}
                            type="button"
                            role="radio"
                            aria-checked={cadenceUnit === unit}
                            tabIndex={isRadioTabStop(cadenceUnit === unit, true, index) ? 0 : -1}
                            className={`segmented-control__option${cadenceUnit === unit ? " segmented-control__option--active" : ""}`}
                            onClick={() => {
                              setCadenceUnit(unit);
                              applyCustomCadence(cadenceInput, unit);
                            }}
                          >
                            {unit === "minutes" ? t.remoteCheckUnitMinutes : t.remoteCheckUnitHours}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* The cadence actually in force, restated in words: the
                        number and its unit are two controls, and a rejected
                        value leaves the previous cadence running. */}
                    <div className="settings-row__status" role="status">
                      {remoteCheckNotice === null ? (
                        <p className="settings-row__hint">{activeCadenceSentence}</p>
                      ) : (
                        <p
                          id="remote-check-range-error"
                          className="settings-row__hint settings-row__hint--danger"
                        >
                          <TriangleAlert aria-hidden="true" />
                          <span>{remoteCheckNotice}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
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
                <div className="settings-row">
                  <div>
                    <strong>{t.safetyConfirmDiscardLabel}</strong>
                    <p>{t.safetyConfirmDiscardDescription}</p>
                  </div>
                  <ToggleSwitch
                    label={t.safetyConfirmDiscardLabel}
                    checked={confirmDiscard}
                    onChange={setConfirmDiscard}
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === "notifications" && (
          <div className="settings-groups">
            {/* The group is named for the situation it covers, not for the
                section it lives in: repeating "Notifications" as a heading
                inside the Notifications tab tells the reader nothing, and no
                other section does it. */}
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsNotificationsWhileAwayTitle}</h3>
              </header>
              <div className="settings-group__body">
                <div className="settings-row">
                  <div>
                    <strong>{t.notificationsEnableLabel}</strong>
                    <p>{t.notificationsEnableDescription}</p>
                  </div>
                  <ToggleSwitch
                    label={t.notificationsEnableLabel}
                    checked={notificationsEnabled}
                    onChange={setNotificationsEnabled}
                  />
                </div>
              </div>
            </section>
            {/* Ordinary settings rows rather than a bullet list, because they
                answer the same question a row does — what is this, and why
                would I want it — and because each carries the icon the
                notification itself will wear, so the vocabulary is learned
                here rather than guessed at in the panel.

                They have no controls on purpose. Per-event muting is a choice
                nobody can make usefully before they have seen the events, and
                three of them do not need a preferences matrix. */}
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.notificationsEventsTitle}</h3>
                <p>{t.notificationsEventsDescription}</p>
              </header>
              <div className="settings-group__body">
                {NOTIFICATION_EVENT_ROWS.map(({ kind, label, description }) => {
                  const Icon = NOTIFICATION_ICONS[kind];
                  return (
                  <div className="settings-row settings-notification-event" key={kind}>
                    <span
                      className={`settings-notification-event__icon settings-notification-event__icon--${NOTIFICATION_KINDS[kind].tone}`}
                      aria-hidden="true"
                    >
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{t[label]}</strong>
                      <p>{t[description]}</p>
                    </div>
                  </div>
                  );
                })}
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
                {/* Two radiogroups so the accessible names still say which
                    group a theme belongs to; the official three are marked by
                    the brand badge, not by a label. */}
                <div
                  className="theme-picker__official"
                  role="radiogroup"
                  aria-label={t.settingsThemeOfficialTitle}
                  onKeyDown={moveFocusWithinRadioGroup}
                >
                  {officialThemeOptions.map(renderThemeCard)}
                </div>
                <div
                  className="theme-picker__community"
                  role="radiogroup"
                  aria-label={t.settingsThemeMoreTitle}
                  onKeyDown={moveFocusWithinRadioGroup}
                >
                  {communityThemeOptions.map(renderThemeCard)}
                </div>
              </div>
            </section>
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsMotionTitle}</h3>
              </header>
              <div className="settings-group__body">
                <div className="settings-row">
                  <div>
                    <strong>{t.reduceMotionLabel}</strong>
                    <p>{t.reduceMotionDescription}</p>
                  </div>
                  <ToggleSwitch
                    label={t.reduceMotionLabel}
                    checked={reducedMotion}
                    onChange={setReducedMotion}
                  />
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
            {/* Beside Language rather than in a rail entry of its own: this is
                the same question about how the interface reads, and a locale
                is not one decision but three. Each option is labelled by what
                it does and shows the result, because "Day first" is a
                description and `30/08/2026` is the answer. */}
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsFormatsTitle}</h3>
                <p>{t.settingsFormatsDescription}</p>
              </header>
              <div className="settings-group__body">
                <div className="settings-row settings-row--stacked">
                  <strong>{t.formatsDateLabel}</strong>
                  <div
                    className="format-picker"
                    role="radiogroup"
                    aria-label={t.formatsDateLabel}
                    onKeyDown={moveFocusWithinRadioGroup}
                  >
                    {DATE_FORMATS.map((option, index) => {
                      const isActive = formats.dateFormat === option;
                      const sample = formatDate(FORMAT_SAMPLE_DATE, {
                        ...formats,
                        dateFormat: option,
                      });
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          aria-label={`${dateFormatLabels[option]}: ${sample}`}
                          tabIndex={isRadioTabStop(isActive, true, index) ? 0 : -1}
                          className={`format-picker__option${isActive ? " format-picker__option--active" : ""}`}
                          onClick={() => setDateFormat(option)}
                        >
                          <span className="format-picker__name">{dateFormatLabels[option]}</span>
                          <span className="format-picker__sample" aria-hidden="true">
                            {sample}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="settings-row settings-row--stacked">
                  <strong>{t.formatsNumberLabel}</strong>
                  <div
                    className="format-picker"
                    role="radiogroup"
                    aria-label={t.formatsNumberLabel}
                    onKeyDown={moveFocusWithinRadioGroup}
                  >
                    {NUMBER_FORMATS.map((option, index) => {
                      const isActive = formats.numberFormat === option;
                      const sample = formatNumber(FORMAT_SAMPLE_NUMBER, {
                        ...formats,
                        numberFormat: option,
                      });
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          aria-label={`${numberFormatLabels[option]}: ${sample}`}
                          tabIndex={isRadioTabStop(isActive, true, index) ? 0 : -1}
                          className={`format-picker__option${isActive ? " format-picker__option--active" : ""}`}
                          onClick={() => setNumberFormat(option)}
                        >
                          <span className="format-picker__name">
                            {numberFormatLabels[option]}
                          </span>
                          <span className="format-picker__sample" aria-hidden="true">
                            {sample}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeSection === "navigation" && (
          <div className="settings-groups">
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsNavigationDestinationsTitle}</h3>
                <p>{t.settingsNavigationDestinationsDescription}</p>
              </header>
              <div className="settings-group__body navigation-destinations">
                {navigationItems.map((item, index) => (
                  <div
                    data-navigation-id={item.id}
                    className={`navigation-destination${
                      draggedNavigationId === item.id ? " navigation-destination--dragging" : ""
                    }${
                      dragOverNavigationId === item.id ? " navigation-destination--drag-over" : ""
                    }`}
                    key={item.id}
                  >
                    <div className="navigation-destination__order-controls">
                      <button
                        className="navigation-destination__handle"
                        type="button"
                        aria-label={`${t.settingsNavigationReorderLabel}: ${item.label}`}
                        title={`${t.settingsNavigationReorderLabel}: ${item.label}`}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.preventDefault();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDraggedNavigationId(item.id);
                        }}
                        onPointerMove={(event) => {
                          if (draggedNavigationId !== item.id) return;
                          const target = document
                            .elementFromPoint(event.clientX, event.clientY)
                            ?.closest<HTMLElement>("[data-navigation-id]");
                          const targetId = target?.dataset.navigationId;
                          const targetIndex = navigationItems.findIndex(
                            (destination) => destination.id === targetId,
                          );
                          setDragOverNavigationId(targetId ?? null);
                          if (targetIndex >= 0 && targetId !== item.id) {
                            moveNavigationDestination(item.id, targetIndex);
                          }
                        }}
                        onPointerUp={(event) => {
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }
                          setDraggedNavigationId(null);
                          setDragOverNavigationId(null);
                        }}
                        onPointerCancel={() => {
                          setDraggedNavigationId(null);
                          setDragOverNavigationId(null);
                        }}
                        onKeyDown={(event) => {
                          const toIndex =
                            event.key === "ArrowUp"
                              ? index - 1
                              : event.key === "ArrowDown"
                                ? index + 1
                                : event.key === "Home"
                                  ? 0
                                  : event.key === "End"
                                    ? navigationItems.length - 1
                                    : null;
                          if (toIndex === null || toIndex < 0 || toIndex >= navigationItems.length) return;
                          event.preventDefault();
                          moveNavigationDestination(item.id, toIndex);
                        }}
                      >
                        <GripVertical aria-hidden="true" />
                      </button>
                      <div className="navigation-destination__move-buttons">
                        <button
                          type="button"
                          className="navigation-destination__move-button"
                          aria-label={`${t.settingsNavigationMoveUpLabel}: ${item.label}`}
                          title={`${t.settingsNavigationMoveUpLabel}: ${item.label}`}
                          disabled={index === 0}
                          onClick={() => moveNavigationDestination(item.id, index - 1)}
                        >
                          <ChevronUp aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="navigation-destination__move-button"
                          aria-label={`${t.settingsNavigationMoveDownLabel}: ${item.label}`}
                          title={`${t.settingsNavigationMoveDownLabel}: ${item.label}`}
                          disabled={index === navigationItems.length - 1}
                          onClick={() => moveNavigationDestination(item.id, index + 1)}
                        >
                          <ChevronDown aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <span className="navigation-destination__icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="navigation-destination__copy">
                      <strong>{item.label}</strong>
                      {!visibleNavigationIds.has(item.id) && (
                        <small>{t.settingsNavigationMovedToMore}</small>
                      )}
                    </span>
                    <ToggleSwitch
                      label={item.label}
                      checked={visibleNavigationIds.has(item.id)}
                      onChange={(isVisible) => setDestinationVisible(item.id, isVisible)}
                    />
                  </div>
                ))}
                <p className="visually-hidden" role="status" aria-live="polite">
                  {navigationOrderNotice}
                </p>
              </div>
            </section>

            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsNavigationAppearanceTitle}</h3>
                <p>{t.settingsNavigationAppearanceDescription}</p>
              </header>
              <div
                className="settings-group__body navigation-display"
                role="radiogroup"
                aria-label={t.settingsNavigationAppearanceTitle}
                onKeyDown={moveFocusWithinRadioGroup}
              >
                {(["icons-and-text", "icons-only"] as const).map((mode, index) => {
                  const isActive = navigationPreferences.displayMode === mode;
                  const label =
                    mode === "icons-and-text"
                      ? t.settingsNavigationIconsAndText
                      : t.settingsNavigationIconsOnly;
                  return (
                    <button
                      key={mode}
                      className={`navigation-display__option${
                        isActive ? " navigation-display__option--active" : ""
                      }`}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      tabIndex={isRadioTabStop(isActive, true, index) ? 0 : -1}
                      onClick={() => setNavigationDisplayMode(mode)}
                    >
                      <span
                        className={`navigation-display__preview navigation-display__preview--${mode}`}
                        aria-hidden="true"
                      >
                        <span><PanelLeft /></span>
                        {mode === "icons-and-text" && <small>{t.navOverview}</small>}
                      </span>
                      <span className="navigation-display__copy">
                        <strong>{label}</strong>
                        <small>
                          {mode === "icons-and-text"
                            ? t.settingsNavigationIconsAndTextDescription
                            : t.settingsNavigationIconsOnlyDescription}
                        </small>
                      </span>
                    </button>
                  );
                })}
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
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.readingCodeFontTitle}</h3>
                <p>{t.readingCodeFontDescription}</p>
              </header>
              <div className="settings-group__body">
                <div
                  className="font-picker"
                  role="radiogroup"
                  aria-label={t.readingCodeFontLabel}
                  onKeyDown={moveFocusWithinRadioGroup}
                >
                  {DIFF_CODE_FONTS.map((font: DiffCodeFont, index: number) => {
                    const isActive = diffPreferences.codeFont === font;
                    return (
                      <button
                        key={font}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isRadioTabStop(isActive, true, index) ? 0 : -1}
                        className={`font-picker__option${isActive ? " font-picker__option--active" : ""}`}
                        /* The whole card is set in the family it selects, so
                           the option is its own specimen rather than a word
                           the reader has to already recognise. */
                        style={{ fontFamily: DIFF_CODE_FONT_STACKS[font] }}
                        onClick={() => setDiffPreferences((previous) => ({ ...previous, codeFont: font }))}
                      >
                        <span className="font-picker__name">{CODE_FONT_LABELS[font]}</span>
                        {/* Not decorative text: this is the comparison the
                            choice actually turns on, so it is hidden from
                            assistive tech — which cannot convey a glyph shape
                            — and left to the eye it is for. */}
                        <span className="font-picker__sample" aria-hidden="true">
                          {CODE_FONT_SAMPLE}
                        </span>
                      </button>
                    );
                  })}
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
                      <p className="status-line status-line--progress git-install__status">
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
                        <p className="version-line">
                          <span className="version-line__label">{t.settingsGitInstalledVersionLabel}</span>
                          <span className="version-line__value">{gitDiagnostics.version}</span>
                        </p>
                        {gitUpdateLine && (
                          <p className={`status-line status-line--${gitUpdateLine.tone} git-install__status`} role="status">
                            {gitUpdateLine.icon}
                            <span>{gitUpdateLine.message}</span>
                          </p>
                        )}
                      </>
                    )}
                    {gitDiagnostics?.state === "missing" && (
                      <p className="status-line status-line--danger git-install__status">
                        <CircleAlert aria-hidden="true" />
                        <span>{t.settingsGeneralGitMissing}</span>
                      </p>
                    )}
                    {gitDiagnostics?.state === "unusable" && (
                      <p className="status-line status-line--danger git-install__status">
                        <CircleAlert aria-hidden="true" />
                        <span>{t.settingsGeneralGitUnusable}</span>
                      </p>
                    )}
                    {gitDiagnostics?.state === "check_failed" && (
                      <p className="status-line status-line--danger git-install__status">
                        <CircleAlert aria-hidden="true" />
                        <span>{t.settingsGeneralGitCheckFailed}</span>
                      </p>
                    )}
                    {gitActionNotice && (
                      <p className={`status-line status-line--${gitActionNotice.tone} git-install__status`} role="status">
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
                <h3>{t.settingsDefaultBranchTitle}</h3>
                <p>{t.settingsDefaultBranchDescription}</p>
              </header>
              <div className="settings-group__body" onBlur={handleDefaultBranchBlur}>
                <div className="settings-row">
                  <div
                    className="segmented-control"
                    role="radiogroup"
                    aria-label={t.settingsDefaultBranchTitle}
                    onKeyDown={moveFocusWithinRadioGroup}
                  >
                    {DEFAULT_BRANCH_SUGGESTIONS.map((suggestion, index) => {
                      const isActive = !showsCustomBranch && shownDefaultBranch === suggestion;
                      return (
                        <button
                          key={suggestion}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          disabled={defaultBranch.isSaving}
                          tabIndex={isRadioTabStop(isActive, true, index) ? 0 : -1}
                          className={`segmented-control__option${isActive ? " segmented-control__option--active" : ""}`}
                          onClick={() => {
                            setIsCustomBranchOpen(false);
                            setBranchInput(suggestion);
                            void saveDefaultBranch(suggestion);
                          }}
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                    {/* "Other" opens the field instead of writing anything:
                        the name is only saved once Git has accepted it. */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={showsCustomBranch}
                      disabled={defaultBranch.isSaving}
                      tabIndex={
                        isRadioTabStop(showsCustomBranch, true, DEFAULT_BRANCH_SUGGESTIONS.length)
                          ? 0
                          : -1
                      }
                      className={`segmented-control__option${showsCustomBranch ? " segmented-control__option--active" : ""}`}
                      onClick={() => setIsCustomBranchOpen(true)}
                    >
                      {t.defaultBranchOtherLabel}
                    </button>
                  </div>
                </div>
                {showsCustomBranch && (
                  <div className="settings-row settings-row--stacked">
                    <label className="text-field text-field--compact">
                      <span>{t.defaultBranchCustomLabel}</span>
                      <input
                        type="text"
                        value={branchInput}
                        placeholder={t.defaultBranchPlaceholder}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => setBranchInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveDefaultBranch(branchInput);
                          }
                        }}
                      />
                    </label>
                  </div>
                )}
                <div className="settings-row__status" role="status">
                  {defaultBranch.isSaving ? (
                    <p className="settings-row__hint">
                      <LoaderCircle aria-hidden="true" className="icon--spinning" />
                      <span>{t.settingsSaving}</span>
                    </p>
                  ) : defaultBranchNotice ? (
                    <p className={`settings-row__hint settings-row__hint--${defaultBranchNotice.tone}`}>
                      {NOTICE_ICONS[defaultBranchNotice.tone]}
                      <span>{defaultBranchNotice.message}</span>
                    </p>
                  ) : defaultBranch.isLoaded && savedDefaultBranch === null ? (
                    <p className="settings-row__hint">{t.defaultBranchUnset}</p>
                  ) : null}
                </div>
              </div>
            </section>
            <section className="settings-group">
              <header className="settings-group__header">
                <h3>{t.settingsHooksTitle}</h3>
              </header>
              <div className="settings-group__body">
                <div className="settings-row">
                  <div>
                    <strong>{t.hooksLabel}</strong>
                    <p>{t.hooksDescription}</p>
                  </div>
                  <ToggleSwitch label={t.hooksLabel} checked={runGitHooks} onChange={setRunGitHooks} />
                </div>
                {/* Shown only while hooks are skipped, and stated plainly: the
                    default is off, and a default that quietly drops a
                    project's own checks has to say so where it is set. */}
                {!runGitHooks && (
                  <p className="settings-row__hint settings-row__hint--warning">
                    <Info aria-hidden="true" />
                    <span>{t.hooksSkippedHint}</span>
                  </p>
                )}
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
                      className="choice-list"
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
                            className={`choice-list__option${isActive ? " choice-list__option--active" : ""}`}
                            onClick={() => void chooseLineEnding(choice)}
                          >
                            <span className="choice-list__label">
                              {lineEndingText[choice].label}
                              {choice === recommendedChoice && (
                                <span className="choice-list__badge">{t.lineEndingsRecommended}</span>
                              )}
                            </span>
                            <span className="choice-list__description">
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

        {/* The updater owns its own rows; this panel only gives them a
            section. Nothing renders when the app was composed without one. */}
        {activeSection === "updates" && applicationUpdates}
      </div>
    </div>
  );
}
