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
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Layers3,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Copy,
  Check,
  X,
  RefreshCw,
  // Distinct glyphs on purpose: `AlertTriangle` is an alias of `TriangleAlert`,
  // so reusing it would leave the error and needs-attention states identical
  // apart from colour.
  CircleAlert,
  TriangleAlert,
  FileDiff,
} from "lucide-react";
import { LANGUAGE_NAMES, LanguageProvider, useLanguage, type Language, type LanguagePreference } from "./i18n";
import {
  getRepositoryOverviewState,
  getWorkingTreeBreakdown,
  getWorkingTreeSummary,
  type ChangeCategory,
  type RepositoryInfo,
  type WorkingTreeStatus,
} from "./repositoryOverview";
import "./styles.css";

type ThemePreference = "system" | "light" | "dark";
type View = "overview" | "settings";
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

const CROCODILE_MARK = (
  <span className="gitodrile-mark" aria-hidden="true" />
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

/**
 * Titlebar overflow menu. For now this only exposes Help → About, but the
 * pattern (button + popover, closing on Escape/outside click) mirrors
 * ProjectMenu so more sections can be added later without a rewrite.
 */
function TitlebarMenu({ onOpenAbout }: { onOpenAbout: () => void }): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="titlebar-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="titlebar-icon-button"
        type="button"
        aria-label={t.titlebarMoreActions}
        title={t.titlebarMoreActions}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Menu aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="titlebar-menu__list" role="menu" aria-label={t.titlebarMoreActions}>
          <div className="titlebar-menu__heading" aria-hidden="true">{t.titlebarHelpSection}</div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onOpenAbout();
            }}
          >
            {t.aboutGitOdrile}
          </button>
        </div>
      )}
    </div>
  );
}

const FOLDER_ICON = <FolderOpen />;

/**
 * Infrequent project-level actions. Uses a button + popover rather than
 * `<details>` so it closes on Escape and on an outside click, and exposes the
 * expanded state to assistive technology.
 */
function ProjectMenu({
  onOpenProject,
  onCloseProject,
  isOpening,
}: {
  onOpenProject: () => void;
  onCloseProject: () => void;
  isOpening: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="project-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="project-menu__trigger"
        type="button"
        aria-label={t.overviewProjectMenu}
        title={t.overviewProjectMenu}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="project-menu__list" role="menu" aria-label={t.overviewProjectMenu}>
          <button
            type="button"
            role="menuitem"
            disabled={isOpening}
            onClick={() => {
              setIsOpen(false);
              onOpenProject();
            }}
          >
            {isOpening ? t.overviewOpening : t.overviewOpenAnotherProject}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onCloseProject();
            }}
          >
            {t.overviewCloseProject}
          </button>
        </div>
      )}
    </div>
  );
}

/** Truncated paths stay fully available: readable on hover/AT, and copyable. */
function ProjectPath({ path }: { path: string }): React.JSX.Element {
  const { t } = useLanguage();
  const [wasCopied, setWasCopied] = useState(false);

  useEffect(() => {
    if (!wasCopied) return;
    const timer = window.setTimeout(() => setWasCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [wasCopied]);

  const copyPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path);
      setWasCopied(true);
    } catch {
      // Clipboard access can be denied; leave the visible path as the fallback.
    }
  };

  return (
    <p className="project-path">
      <span className="project-path__value" title={path}>
        {path}
      </span>
      <button
        className="project-path__copy"
        type="button"
        onClick={() => void copyPath()}
        aria-label={t.overviewCopyPath}
        title={wasCopied ? t.overviewPathCopied : t.overviewCopyPath}
      >
        {wasCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <span className="visually-hidden" role="status">
        {wasCopied ? t.overviewPathCopied : ""}
      </span>
    </p>
  );
}

/**
 * Announces a *finished refresh* without moving focus. Deliberately stays empty
 * until a check has actually run and completed: mirroring the card's headline
 * from the first render would make a screen reader read the same status twice.
 */
function StatusAnnouncement({ isBusy, message }: { isBusy: boolean; message: string }): React.JSX.Element {
  const [announcement, setAnnouncement] = useState("");
  const wasBusyRef = useRef(false);

  useEffect(() => {
    if (isBusy) {
      wasBusyRef.current = true;
      setAnnouncement("");
    } else if (wasBusyRef.current) {
      setAnnouncement(message);
    }
  }, [isBusy, message]);

  return (
    <span className="visually-hidden" role="status">
      {announcement}
    </span>
  );
}

const CATEGORY_LABEL_KEYS = {
  changed: "statusCategoryChanged",
  new: "statusCategoryNew",
  deleted: "statusCategoryDeleted",
  renamed: "statusCategoryRenamed",
  conflicted: "statusCategoryConflicted",
} as const satisfies Record<ChangeCategory, keyof ReturnType<typeof useLanguage>["t"]>;

function OverviewPanel({
  project,
  openError,
  isOpening,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onCheckChanges,
  onOpenProject,
  onCloseProject,
}: {
  project: RepositoryInfo | null;
  openError: string | null;
  isOpening: boolean;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  onCheckChanges: () => void;
  onOpenProject: () => void;
  onCloseProject: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  if (project) {
    const overview = getRepositoryOverviewState(project);
    const projectType = t[overview.projectTypeKey];
    const versionValue = overview.isDetached
      ? t.overviewSpecificSavedVersion
      : (overview.versionLine ?? t.overviewNoSavedVersions);

    // The working tree is only unknown before the first check has finished, so
    // the card never invents a count and never blanks out a known one while a
    // later refresh is running.
    const summary = workingTree ? getWorkingTreeSummary(workingTree) : null;
    const breakdown = workingTree ? getWorkingTreeBreakdown(workingTree) : [];
    const isLoading = isOpening || (isCheckingChanges && !workingTree);
    const errorMessage = openError ?? (workingTree ? null : workingTreeError);

    let heroStatus: "loading" | "error" | "success" | "attention" | "neutral";
    let heroHeadline: string;
    let heroMessage: string;
    if (isLoading) {
      heroStatus = "loading";
      heroHeadline = isOpening ? t.overviewOpeningTitle : t.statusCheckingTitle;
      heroMessage = isOpening ? t.overviewOpeningDescription : t.statusCheckingMessage;
    } else if (errorMessage) {
      heroStatus = "error";
      heroHeadline = openError ? t.overviewOpenFailedTitle : t.statusCheckFailedTitle;
      heroMessage = errorMessage;
    } else if (summary) {
      heroStatus = summary.tone === "positive" ? "success" : summary.tone;
      heroHeadline = t[summary.headlineKey];
      heroMessage =
        summary.conflicted > 0
          ? t.statusConflictsMessage(summary.conflicted)
          : summary.total === 0
            ? t.statusCleanMessage
            : t.statusChangesMessage(summary.total);
    } else {
      // Reached only if a check has neither finished nor failed yet.
      heroStatus = "success";
      heroHeadline = t[overview.headlineKey];
      heroMessage = repositoryStatus(project, t);
    }

    return (
      <div className="project-overview" aria-busy={isOpening || isCheckingChanges}>
        <header className="project-overview__header">
          <div className="project-overview__identity">
            <h1>{project.name}</h1>
            <ul className="project-chips">
              <li className="project-chip">
                <Layers3 aria-hidden="true" />
                {projectType}
              </li>
              <li className="project-chip project-chip--technical">
                <GitBranch aria-hidden="true" />
                <span className="visually-hidden">{t.overviewCurrentVersionLine}: </span>
                {versionValue}
              </li>
            </ul>
          </div>
          <ProjectMenu onOpenProject={onOpenProject} onCloseProject={onCloseProject} isOpening={isOpening} />
        </header>

        <section
          className={`project-hero project-hero--${heroStatus}`}
          aria-labelledby="project-hero-heading"
        >
          <div className="project-hero__icon" aria-hidden="true">
            {isLoading ? (
              <LoaderCircle />
            ) : errorMessage ? (
              <CircleAlert />
            ) : heroStatus === "attention" ? (
              <TriangleAlert />
            ) : heroStatus === "neutral" ? (
              <FileDiff />
            ) : (
              <CheckCircle2 />
            )}
          </div>
          <div className="project-hero__content">
            <h2 id="project-hero-heading">{heroHeadline}</h2>
            {errorMessage && !isLoading ? (
              <p key="hero-error" role="alert">
                {heroMessage}
              </p>
            ) : (
              <p key="hero-message">{heroMessage}</p>
            )}
            {/* A refresh that fails after a successful one keeps the known
                status visible, but must still say the numbers are stale. */}
            {workingTree && workingTreeError && !isCheckingChanges && (
              <p className="project-hero__note" role="alert">
                {t.statusRefreshFailedNote}
              </p>
            )}
            {breakdown.length > 0 && (
              <ul className="status-breakdown" aria-label={t.statusBreakdownLabel}>
                {breakdown.map((item) => (
                  <li
                    key={item.category}
                    className={`status-breakdown__item${item.category === "conflicted" ? " status-breakdown__item--attention" : ""}`}
                  >
                    {t[CATEGORY_LABEL_KEYS[item.category]](item.count)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="project-hero__actions">
            <button
              className="primary-button project-hero__action"
              type="button"
              onClick={onCheckChanges}
              disabled={isCheckingChanges || isOpening}
            >
              <RefreshCw
                aria-hidden="true"
                className={isCheckingChanges ? "icon--spinning" : undefined}
              />
              {isCheckingChanges ? t.statusRefreshing : t.statusRefresh}
            </button>
            <button
              className="secondary-button project-hero__action"
              type="button"
              disabled
              title={t.overviewReviewChangesTitle}
            >
              {t.overviewReviewChanges}
            </button>
          </div>
          <StatusAnnouncement isBusy={isCheckingChanges} message={`${heroHeadline}. ${heroMessage}`} />
        </section>

        <section className="project-facts" aria-labelledby="project-facts-heading">
          <h2 className="project-facts__title" id="project-facts-heading">
            {t.overviewProjectDetails}
          </h2>
          <div className="project-facts__grid">
            <article className="project-fact">
              <h3>{t.overviewCurrentVersionLine}</h3>
              <p className="project-fact__value project-fact__value--technical">{versionValue}</p>
              <p>{t[overview.versionDescriptionKey]}</p>
            </article>

            <article className="project-fact">
              <h3>{t.overviewProjectLocation}</h3>
              <ProjectPath path={project.path} />
              {overview.wasOpenedFromNestedFolder && (
                <p className="project-fact__nested">
                  {t.overviewOpenedFrom}
                  <span title={project.selectedPath}>{project.selectedPath}</span>
                </p>
              )}
            </article>

            <article className="project-fact">
              <h3>{t.overviewProjectType}</h3>
              <p className="project-fact__value">{projectType}</p>
              <p>{t[overview.projectTypeDescriptionKey]}</p>
            </article>
          </div>
        </section>

        <details className="project-technical">
          <summary>
            <span>{t.overviewTechnicalDetails}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <dl>
            <div>
              <dt>{t.overviewResolvedRoot}</dt>
              <dd>{project.path}</dd>
            </div>
            {overview.wasOpenedFromNestedFolder && (
              <div>
                <dt>{t.overviewSelectedFolder}</dt>
                <dd>{project.selectedPath}</dd>
              </div>
            )}
            <div>
              <dt>{t.overviewGitDirectory}</dt>
              <dd>{project.gitDir}</dd>
            </div>
            {overview.isWorktree && (
              <div>
                <dt>{t.overviewCommonGitDirectory}</dt>
                <dd>{project.commonGitDir}</dd>
              </div>
            )}
          </dl>
        </details>
      </div>
    );
  }

  return (
    <div className="empty-state" aria-busy={isOpening}>
      <div className={`empty-state__icon${isOpening ? " empty-state__icon--loading" : ""}`} aria-hidden="true">
        {isOpening ? <LoaderCircle /> : FOLDER_ICON}
      </div>
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
  const [viewHistory, setViewHistory] = useState<View[]>(["overview"]);
  const [viewHistoryIndex, setViewHistoryIndex] = useState(0);
  const view = viewHistory[viewHistoryIndex];

  const navigateToView = (next: View): void => {
    if (next === view) {
      return;
    }
    setViewHistory((history) => [...history.slice(0, viewHistoryIndex + 1), next]);
    setViewHistoryIndex((index) => index + 1);
  };
  const goBack = (): void => setViewHistoryIndex((index) => Math.max(0, index - 1));
  const goForward = (): void => setViewHistoryIndex((index) => Math.min(viewHistory.length - 1, index + 1));
  const canGoBack = viewHistoryIndex > 0;
  const canGoForward = viewHistoryIndex < viewHistory.length - 1;
  const [theme, setTheme] = useTheme();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
  );
  const [project, setProject] = useState<RepositoryInfo | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [workingTree, setWorkingTree] = useState<WorkingTreeStatus | null>(null);
  const [workingTreeError, setWorkingTreeError] = useState<string | null>(null);
  const [isCheckingChanges, setIsCheckingChanges] = useState(false);
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

  const projectPath = project?.path ?? null;

  const checkWorkingTree = async (path: string): Promise<void> => {
    setIsCheckingChanges(true);
    try {
      const status = await invoke<WorkingTreeStatus>("read_working_tree_status", { path });
      setWorkingTree(status);
      setWorkingTreeError(null);
    } catch (error) {
      // Keep the last known status visible; the card reports the failure only
      // when it has nothing truthful to show instead.
      setWorkingTreeError(localizeAppError(error, t, t.statusCouldntCheck));
    } finally {
      setIsCheckingChanges(false);
    }
  };

  // Never asks for a status when no project is open, and re-reads whenever the
  // opened project changes.
  useEffect(() => {
    setWorkingTree(null);
    setWorkingTreeError(null);
    if (!projectPath) {
      return;
    }
    void checkWorkingTree(projectPath);
  }, [projectPath]);

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
    { id: "go-overview", label: t.commandGoOverview, action: () => navigateToView("overview") },
    { id: "go-settings", label: t.commandGoSettings, action: () => navigateToView("settings") },
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
        <div className="window-titlebar__brand" data-tauri-drag-region>
          <span className="window-titlebar__mark" aria-hidden="true">{CROCODILE_MARK}</span>
          <span className="window-titlebar__name" data-tauri-drag-region>GitOdrile</span>
        </div>

        <div className="window-titlebar__actions">
          <TitlebarMenu onOpenAbout={() => setIsAboutOpen(true)} />
          <button
            className="titlebar-command-button"
            type="button"
            ref={paletteTriggerRef}
            aria-label={t.titlebarOpenCommandPalette}
            title={t.titlebarJumpToHint}
            onClick={openPalette}
          >
            {SEARCH_ICON}
            <span className="titlebar-command-button__label">{t.titlebarJumpTo}</span>
          </button>
          <div className="titlebar-history-controls">
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoBack}
              title={t.titlebarGoBack}
              aria-label={t.titlebarGoBack}
              onClick={goBack}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoForward}
              title={t.titlebarGoForward}
              aria-label={t.titlebarGoForward}
              onClick={goForward}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <span className="titlebar-badge" aria-label={t.alphaBadgeAriaLabel}>{t.alphaBadge}</span>
        </div>

        <div
          className="window-titlebar__drag"
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
      </header>

      <main className={`app-shell${isSidebarCollapsed ? " app-shell--collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">{CROCODILE_MARK}</div>
              {!isSidebarCollapsed && (
                <div className="brand-copy">
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
              onClick={() => navigateToView("overview")}
            >
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.overview}</span>
              <span className="nav-item__label">{t.navOverview}</span>
            </button>
            <button className="nav-item" type="button" disabled title={t.navChangesTitle}>
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.changes}</span>
              <span className="nav-item__label">{t.navChanges}</span>
              <span className="nav-item__availability">{t.navComingSoon}</span>
            </button>
            <button className="nav-item" type="button" disabled title={t.navHistoryTitle}>
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.history}</span>
              <span className="nav-item__label">{t.navHistory}</span>
              <span className="nav-item__availability">{t.navComingSoon}</span>
            </button>
            <button className="nav-item" type="button" disabled title={t.navRecoveryTitle}>
              <span className="nav-item__icon" aria-hidden="true">{NAV_ICONS.recovery}</span>
              <span className="nav-item__label">{t.navRecovery}</span>
              <span className="nav-item__availability">{t.navComingSoon}</span>
            </button>
          </nav>

          <nav aria-label={t.navApplicationAriaLabel} className="nav--secondary">
            <button
              className={`nav-item${view === "settings" ? " nav-item--active" : ""}`}
              type="button"
              aria-current={view === "settings" ? "page" : undefined}
              title={t.navSettings}
              onClick={() => navigateToView("settings")}
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
              onClick={() => navigateToView("overview")}
            >
              <span aria-hidden="true">{NAV_ICONS.overview}</span>
              {t.navOverview}
            </button>
            <button
              className={`compact-nav__item${view === "settings" ? " compact-nav__item--active" : ""}`}
              type="button"
              aria-current={view === "settings" ? "page" : undefined}
              onClick={() => navigateToView("settings")}
            >
              <span aria-hidden="true">{NAV_ICONS.settings}</span>
              {t.navSettings}
            </button>
          </nav>
          {(view !== "overview" || !project) && (
            <header className="topbar">
              <h1>{view === "overview" ? t.navOverview : t.navSettings}</h1>
            </header>
          )}

          {view === "overview" ? (
            <OverviewPanel
              project={project}
              openError={openError}
              isOpening={isOpening}
              workingTree={workingTree}
              workingTreeError={workingTreeError}
              isCheckingChanges={isCheckingChanges}
              onCheckChanges={() => projectPath && void checkWorkingTree(projectPath)}
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
            <button
              className="about-dialog__close"
              type="button"
              aria-label={t.commonClose}
              title={t.commonClose}
              onClick={() => setIsAboutOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <div className="about-dialog__mark" aria-hidden="true">{CROCODILE_MARK}</div>
            <p className="eyebrow">{t.aboutGitOdrile}</p>
            <h2 id="about-title">{t.aboutHeading}</h2>
            <p>{t.aboutDescription}</p>
            <dl className="about-details">
              <div><dt>{t.commonVersion}</dt><dd>{APP_VERSION}</dd></div>
            </dl>
            <p className="about-dialog__footer">{t.aboutFooterMadeWith}</p>
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
