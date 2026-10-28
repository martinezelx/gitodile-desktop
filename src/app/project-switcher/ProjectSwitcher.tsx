import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CloudDownload,
  Copy,
  FileDiff,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Plus,
  Search,
  Settings,
  Star,
  X,
} from "lucide-react";
import { useLanguage } from "../../i18n";
import {
  copyTextToClipboard,
  usePortalFlyout,
  ProjectAvatar,
  type ProjectAvatarStyle,
  type ProjectIconChoice,
  type TechnologyId,
} from "../../shared/ui";
import { autoHideScrollbarProps } from "../../shared/ui/autoHideScrollbar";

export type ProjectSwitcherEntry = {
  id: string;
  name: string;
  contextLabel: string | null;
  /** The branch the project is on, or null when it is not on a branch. */
  branch?: string | null;
  /** Where the project lives on disk: shown under its name at the popup's head
   * and in its actions, and what "Copy path" copies. */
  path?: string;
  hasError: boolean;
  hasOperationInProgress: boolean;
  hasUnsavedChanges: boolean;
  isFavourite: boolean;
  /** The project's own icon choice (an emoji or "initials"), or null to follow
   * the global style. */
  iconChoice?: ProjectIconChoice;
  /** The detected technology, shown under the emoji and over the initials. */
  technology?: TechnologyId | null;
  /** The global avatar appearance preference carried onto every row. */
  avatarStyle?: ProjectAvatarStyle;
};

/** A project that was open once and is not now: Home's recent list, minus
 * whatever is open. */
export type ProjectSwitcherRecent = {
  path: string;
  name: string;
  iconChoice?: ProjectIconChoice;
  technology?: TechnologyId | null;
  avatarStyle?: ProjectAvatarStyle;
};

/** What the active project itself needs, worn on the trigger's avatar: never
 * another project's state (those stay on the popup's rows). One at a time,
 * the most urgent: something to resolve, then work in progress. */
export type ProjectStatusMark = {
  kind: "resolve" | "busy";
  description: string;
};

export type ProjectQuickSwitchProps = {
  entries: ProjectSwitcherEntry[];
  /** Closed projects the popup offers to reopen, newest first. */
  recent: readonly ProjectSwitcherRecent[];
  activeId: string | null;
  /** False while a save/publish dialog is open for the active project — see
   * the "block switching" decision recorded in task 012. Switching, reopening
   * and closing are all disabled in that state; the head's settings and
   * folder still act on the project the dialog belongs to. */
  canSwitch: boolean;
  isOpening: boolean;
  onActivate: (id: string) => void;
  onOpenRecent: (path: string) => void;
  onClose: (id: string) => void;
  onOpenAnother: () => void;
  onCreate: () => void;
  onClone: () => void;
  onToggleFavourite: (id: string) => void;
  /** Opens the settings that belong to one project. Activating first is the
   * caller's job: those settings are read from an open project. */
  onOpenProjectSettings: (id: string) => void;
  onPrefetchProjectSettings?: (id: string) => void;
  /** Opens a project's folder in the system's file manager. */
  onOpenFolder: (id: string) => void;
  /** Goes to Home, the view of every project. Home stays out of the rail's
   * destinations (task 184), so the popup's foot is its way in. */
  onOpenHome: () => void;
  /** The active project's own state, if it needs the reader. */
  activeStatus?: ProjectStatusMark | null;
};

/**
 * Favourites first, everything else after, each group keeping the order it
 * already had. Display order only — `sessionsState.order` stays canonical, so
 * favouriting a project never silently rearranges what Ctrl/Cmd+Tab cycles
 * through or which project the reducer considers next.
 *
 * Generic over anything that knows whether it is a favourite, because the
 * welcome screen's recent-projects list shows the same favourites, from the
 * same store, and has to order them the same way. One rule, stated once: two
 * copies of "favourites first, stable within group" is exactly how the two
 * lists start disagreeing.
 */
export function orderByFavourite<Entry extends { isFavourite: boolean }>(
  entries: readonly Entry[],
): Entry[] {
  return [
    ...entries.filter((entry) => entry.isFavourite),
    ...entries.filter((entry) => !entry.isFavourite),
  ];
}

type IndicatorMeta = {
  Icon: typeof CircleAlert;
  label: string;
  tone: "error" | "operation" | "unsaved";
};

/** Returns every relevant state in action priority order. Clean projects
 * deliberately get no indicator, keeping the list quiet without hiding a
 * second condition behind the first one. */
function indicatorMetas(
  entry: ProjectSwitcherEntry,
  t: ReturnType<typeof useLanguage>["t"],
): IndicatorMeta[] {
  const metas: IndicatorMeta[] = [];
  if (entry.hasError) {
    metas.push({ Icon: CircleAlert, label: t.projectSwitcherErrorIndicator, tone: "error" });
  }
  if (entry.hasOperationInProgress) {
    metas.push({ Icon: LoaderCircle, label: t.projectSwitcherOperationIndicator, tone: "operation" });
  }
  if (entry.hasUnsavedChanges) {
    metas.push({ Icon: FileDiff, label: t.projectSwitcherUnsavedIndicator, tone: "unsaved" });
  }
  return metas;
}

/** Row status indicators. Shape carries the meaning (not just color),
 * so it reads correctly for colorblind users and screen readers alike. */
function RowIndicators({ entry }: { entry: ProjectSwitcherEntry }): React.JSX.Element | null {
  const { t } = useLanguage();
  const metas = indicatorMetas(entry, t);
  if (metas.length === 0) {
    return null;
  }
  return (
    <span className="project-switcher__indicators">
      {metas.map(({ Icon, label, tone }) => (
        <Icon
          key={tone}
          aria-label={label}
          className={`project-switcher__indicator project-switcher__indicator--${tone}${tone === "operation" ? " icon--spinning" : ""}`}
        />
      ))}
    </span>
  );
}

/** The folder a project sits in, for a row that has no branch to show. */
function parentFolder(path: string): string {
  const parts = path.replaceAll("\\", "/").replace(/\/+$/, "").split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : path;
}

/**
 * The project half of the status bar's `project · branch` block, and the one
 * place to change projects: the twin of the branch popup beside it, so both
 * halves are learnt once (task 189). The popup leads with the active project
 * and the three things done to it — settings, its folder, closing it — then
 * the other open projects and the recently closed ones, and its foot adds a
 * project or goes Home.
 *
 * A project's actions open in place of the list, the way a branch's do: the
 * popup clips its overflow and dismisses on a press outside itself, so a
 * second floating surface anchored to a row would be cut off or would close
 * the control that opened it. Adding a project docks its three ways at the
 * foot for the same reason.
 */
export function ProjectQuickSwitch({
  entries,
  recent,
  activeId,
  canSwitch,
  isOpening,
  onActivate,
  onOpenRecent,
  onClose,
  onOpenAnother,
  onCreate,
  onClone,
  onToggleFavourite,
  onOpenProjectSettings,
  onPrefetchProjectSettings,
  onOpenFolder,
  onOpenHome,
  activeStatus = null,
}: ProjectQuickSwitchProps): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const active = entries.find((entry) => entry.id === activeId) ?? null;
  const actionEntry = actionId ? entries.find((entry) => entry.id === actionId) ?? null : null;
  const needle = query.trim().toLocaleLowerCase();
  const others = orderByFavourite(entries.filter((entry) => entry.id !== activeId)).filter(
    (entry) => !needle || entry.name.toLocaleLowerCase().includes(needle),
  );
  const closed = recent.filter((entry) => !needle || entry.name.toLocaleLowerCase().includes(needle));
  // The trigger speaks for the active project only, the way the branch's marker
  // speaks for its branch: other projects' states stay on their rows.
  const status = active ? activeStatus : null;

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    setActionId(null);
    setIsAdding(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { popupRef, style } = usePortalFlyout(isOpen, triggerRef, close, "below", "none");
  // The search takes focus on opening, as on the branch popup, although the
  // head's buttons come first in the popup: typing a name is what the popup
  // is opened for. Once the popup is visible — a hidden element cannot take
  // focus — and once per opening.
  const hasFocused = useRef(false);
  useLayoutEffect(() => {
    if (!isOpen) {
      hasFocused.current = false;
      return;
    }
    if (hasFocused.current || style.visibility === "hidden") return;
    hasFocused.current = true;
    searchRef.current?.focus();
  }, [isOpen, style.visibility]);
  useEffect(() => {
    if (actionId) backRef.current?.focus();
  }, [actionId]);
  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  /** Closes first, so a dialog the action opens remembers the trigger as the
   * place to hand focus back to rather than a row that is about to unmount. */
  const run = (action: () => void): void => {
    close(true);
    action();
  };
  const rowButtons = (): HTMLButtonElement[] =>
    Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>(".project-quick-switch__choose:not(:disabled)") ?? []);

  const toggleOpen = (): void => {
    if (isOpen) {
      close(true);
      return;
    }
    setQuery("");
    setActionId(null);
    setIsAdding(false);
    setIsOpen(true);
  };

  const triggerLabel = active ? t.projectSwitcherTrigger(active.name) : t.statusBarNoProject;
  const blockedHint = canSwitch ? undefined : t.projectSwitcherSwitchBlockedHint;

  const avatarOf = (entry: ProjectSwitcherEntry | ProjectSwitcherRecent, id: string, className: string): React.JSX.Element => (
    <ProjectAvatar
      id={id}
      name={entry.name}
      className={className}
      iconChoice={entry.iconChoice}
      technology={entry.technology}
      style={entry.avatarStyle}
    />
  );

  const addRows = (
    <div className="project-quick-switch__add" role="group" aria-label={t.projectSwitcherAddProject}>
      <button className="app-menu__item" type="button" onClick={() => run(onCreate)}>
        <FolderPlus aria-hidden="true" />
        <span>{t.projectSwitcherCreateProject}</span>
      </button>
      <button className="app-menu__item" type="button" disabled={isOpening} onClick={() => run(onOpenAnother)}>
        <FolderOpen aria-hidden="true" />
        <span>{entries.length > 0 ? t.projectSwitcherOpenAnotherProject : t.projectSwitcherOpenProject}</span>
      </button>
      <button className="app-menu__item" type="button" onClick={() => run(onClone)}>
        <CloudDownload aria-hidden="true" />
        <span>{t.projectSwitcherCloneProject}</span>
      </button>
    </div>
  );

  const actionsView = actionEntry && (
    <div className="project-quick-switch__actions">
      <div className="project-quick-switch__head">
        <button
          ref={backRef}
          type="button"
          className="project-quick-switch__icon"
          aria-label={t.projectSwitcherBack}
          onClick={() => {
            setActionId(null);
            window.requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        {avatarOf(actionEntry, actionEntry.id, "project-quick-switch__avatar project-quick-switch__avatar--small")}
        <span className="project-quick-switch__copy">
          <span className="project-quick-switch__name">{actionEntry.name}</span>
          {actionEntry.path && <span className="project-quick-switch__context" title={actionEntry.path}>{actionEntry.path}</span>}
        </span>
      </div>
      {actionEntry.id !== activeId && (
        <button className="app-menu__item" type="button" disabled={!canSwitch} title={blockedHint} onClick={() => run(() => onActivate(actionEntry.id))}>
          <ArrowRight aria-hidden="true" />
          <span>{t.projectSwitcherGoTo}</span>
        </button>
      )}
      <button
        className="app-menu__item"
        type="button"
        disabled={!canSwitch && actionEntry.id !== activeId}
        title={actionEntry.id !== activeId ? blockedHint : undefined}
        onPointerEnter={() => onPrefetchProjectSettings?.(actionEntry.id)}
        onFocus={() => onPrefetchProjectSettings?.(actionEntry.id)}
        onClick={() => run(() => onOpenProjectSettings(actionEntry.id))}
      >
        <Settings aria-hidden="true" />
        <span>{t.projectSettingsOpen}</span>
      </button>
      <button className="app-menu__item" type="button" onClick={() => run(() => onOpenFolder(actionEntry.id))}>
        <FolderOpen aria-hidden="true" />
        <span>{t.projectSwitcherShowInFolder}</span>
      </button>
      {actionEntry.path && (
        <button
          className="app-menu__item"
          type="button"
          onClick={() => {
            const path = actionEntry.path ?? "";
            void copyTextToClipboard(path).then(() => setCopiedId(actionEntry.id), () => undefined);
          }}
        >
          {copiedId === actionEntry.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span aria-live="polite">{copiedId === actionEntry.id ? t.projectSwitcherPathCopied : t.projectSwitcherCopyPath}</span>
        </button>
      )}
      <div className="app-menu__divider" role="separator" />
      <button
        className="app-menu__item"
        type="button"
        disabled={!canSwitch && actionEntry.id === activeId}
        title={actionEntry.id === activeId ? blockedHint : undefined}
        onClick={() => run(() => onClose(actionEntry.id))}
      >
        <X aria-hidden="true" />
        <span>{t.projectSwitcherCloseLabel(actionEntry.name)}</span>
      </button>
    </div>
  );

  const listView = (
    <>
      {active && (
        <div className="project-quick-switch__head">
          {avatarOf(active, active.id, "project-quick-switch__avatar")}
          <span className="project-quick-switch__copy">
            <span className="project-quick-switch__name">{active.name}</span>
            {active.path && <span className="project-quick-switch__context" title={active.path}>{active.path}</span>}
          </span>
          {/* Settings, folder, close: configure it, find it, put it away —
              the destructive control last in reading and tab order. */}
          <span className="project-quick-switch__head-actions">
            <button
              type="button"
              className="project-quick-switch__icon"
              aria-label={t.projectSettingsOpenFor(active.name)}
              data-tooltip={t.projectSettingsOpen}
              onPointerEnter={() => onPrefetchProjectSettings?.(active.id)}
              onFocus={() => onPrefetchProjectSettings?.(active.id)}
              onClick={() => run(() => onOpenProjectSettings(active.id))}
            >
              <Settings aria-hidden="true" />
            </button>
            <button
              type="button"
              className="project-quick-switch__icon"
              aria-label={t.projectSwitcherShowInFolder}
              data-tooltip={t.projectSwitcherShowInFolder}
              onClick={() => run(() => onOpenFolder(active.id))}
            >
              <FolderOpen aria-hidden="true" />
            </button>
            <button
              type="button"
              className="project-quick-switch__icon"
              aria-label={t.projectSwitcherCloseLabel(active.name)}
              data-tooltip={blockedHint ?? t.projectSwitcherCloseLabel(active.name)}
              disabled={!canSwitch}
              onClick={() => run(() => onClose(active.id))}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
      <div className="project-quick-switch__search">
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder={t.projectSwitcherSearchPlaceholder}
          aria-label={t.projectSwitcherSearchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              rowButtons()[0]?.focus();
              return;
            }
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            // Enter takes the first row the search left, open or recent.
            const first = rowButtons()[0];
            if (first) {
              event.preventDefault();
              first.click();
            }
          }}
        />
      </div>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="project-quick-switch__results auto-hide-scrollbar"
        onKeyDown={(event) => {
          // Up and down walk the rows; up from the first returns to the
          // search, so the list and its filter read as one control.
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const rows = rowButtons();
          const index = rows.indexOf(event.target as HTMLButtonElement);
          if (index === -1) return;
          event.preventDefault();
          if (event.key === "ArrowUp" && index === 0) searchRef.current?.focus();
          else rows[event.key === "ArrowDown" ? Math.min(index + 1, rows.length - 1) : index - 1]?.focus();
        }}
      >
        {others.length > 0 && (
          <section aria-label={t.projectSwitcherOpenSection}>
            <h3 className="project-quick-switch__caption">{t.projectSwitcherOpenSection}</h3>
            <ul className="project-quick-switch__list" role="list">
              {others.map((entry) => {
                const detail = [entry.contextLabel, entry.branch].filter(Boolean).join(" · ");
                const accessibleName = entry.contextLabel ? `${entry.name} (${entry.contextLabel})` : entry.name;
                return (
                  <li key={entry.id} className="project-quick-switch__item">
                    <button
                      type="button"
                      className="project-quick-switch__choose"
                      disabled={!canSwitch}
                      title={blockedHint}
                      aria-label={t.projectSwitchToLabel(accessibleName)}
                      onClick={() => run(() => onActivate(entry.id))}
                    >
                      {avatarOf(entry, entry.id, "project-quick-switch__avatar")}
                      <span className="project-quick-switch__copy">
                        <span className="project-quick-switch__name">{entry.name}</span>
                        {detail && <span className="project-quick-switch__context">{detail}</span>}
                      </span>
                      <RowIndicators entry={entry} />
                    </button>
                    <button
                      type="button"
                      className={`project-quick-switch__favourite${entry.isFavourite ? " project-quick-switch__favourite--on" : ""}`}
                      aria-pressed={entry.isFavourite}
                      aria-label={
                        entry.isFavourite
                          ? t.projectSwitcherUnfavourite(accessibleName)
                          : t.projectSwitcherFavourite(accessibleName)
                      }
                      data-tooltip={entry.isFavourite ? t.projectSwitcherUnfavouriteHint : t.projectSwitcherFavouriteHint}
                      onClick={() => onToggleFavourite(entry.id)}
                    >
                      <Star aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="project-quick-switch__more"
                      aria-label={t.projectSwitcherActions(accessibleName)}
                      aria-haspopup="menu"
                      aria-expanded={false}
                      onClick={() => {
                        setQuery("");
                        setActionId(entry.id);
                      }}
                    >
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {closed.length > 0 && (
          <section aria-label={t.projectSwitcherRecentSection}>
            <h3 className="project-quick-switch__caption">{t.projectSwitcherRecentSection}</h3>
            <ul className="project-quick-switch__list" role="list">
              {closed.map((entry) => (
                <li key={entry.path} className="project-quick-switch__item">
                  <button
                    type="button"
                    className="project-quick-switch__choose"
                    disabled={!canSwitch || isOpening}
                    title={blockedHint ?? entry.path}
                    aria-label={t.projectSwitcherReopen(entry.name)}
                    onClick={() => run(() => onOpenRecent(entry.path))}
                  >
                    {avatarOf(entry, entry.path, "project-quick-switch__avatar")}
                    <span className="project-quick-switch__copy">
                      <span className="project-quick-switch__name">{entry.name}</span>
                      <span className="project-quick-switch__context">{parentFolder(entry.path)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {others.length === 0 && closed.length === 0 && (
          <p className="empty-line empty-line--menu project-quick-switch__empty">
            {needle ? t.projectSwitcherSearchEmpty : active ? t.projectSwitcherOnlyOne : t.projectSwitcherEmptyHint}
          </p>
        )}
      </div>
      {isAdding ? addRows : (
        <div className="project-quick-switch__footer">
          <button
            type="button"
            className="ghost-button project-quick-switch__foot-action"
            aria-expanded={false}
            disabled={!canSwitch}
            title={blockedHint}
            onClick={() => setIsAdding(true)}
          >
            <Plus aria-hidden="true" />
            <span>{t.projectSwitcherAddProject}</span>
          </button>
          <button
            type="button"
            className="ghost-button project-quick-switch__foot-action"
            onClick={() => run(onOpenHome)}
          >
            <span>{t.projectSwitcherAllInHome}</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`status-bar__seg status-bar__project${active ? "" : " status-bar__seg--muted"}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={status ? `${triggerLabel} · ${status.description}` : triggerLabel}
        // The full name, the way every strip item reveals what it had to
        // truncate, and what the mark says when there is one.
        data-tooltip={active ? [active.name, status?.description].filter(Boolean).join(" · ") : undefined}
        onPointerEnter={() => active && onPrefetchProjectSettings?.(active.id)}
        onClick={toggleOpen}
      >
        {active ? (
          <span className="status-bar__project-avatar">
            {avatarOf(active, active.id, "status-bar__avatar")}
            {/* Shape carries the state as well as tone: a ring turning while
                work runs, the popup rows' alert glyph for something to
                resolve. Keyed by kind so a mark that arrives breathes once
                (`.attention-breathe`). */}
            {status && (
              <span
                key={status.kind}
                className={`status-bar__mark status-bar__mark--${status.kind}${status.kind === "busy" ? "" : " attention-breathe"}`}
                aria-hidden="true"
              >
                {status.kind === "resolve" && <CircleAlert />}
              </span>
            )}
          </span>
        ) : (
          <FolderClosed aria-hidden="true" />
        )}
        <span className="status-bar__project-name">{active ? active.name : t.statusBarNoProject}</span>
        {/* The branch's chevron: both popups open upwards from the strip. */}
        <ChevronUp aria-hidden="true" className="status-bar__chevron" />
      </button>
      {isOpen && createPortal(
        <div
          ref={popupRef}
          className="app-menu project-quick-switch"
          role="dialog"
          aria-label={t.projectSwitcherAriaLabel}
          style={style}
        >
          {actionEntry ? actionsView : listView}
        </div>,
        document.body,
      )}
    </>
  );
}
