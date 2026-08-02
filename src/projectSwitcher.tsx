import React, { useEffect, useRef, useState } from "react";
import { CircleAlert, FileDiff, FolderPlus, LoaderCircle, X } from "lucide-react";
import { useLanguage } from "./i18n";
import { avatarColorVar, avatarInitials } from "./projectAvatar";
import { autoHideScrollbarProps } from "./autoHideScrollbar";

export type ProjectSwitcherEntry = {
  id: string;
  name: string;
  contextLabel: string | null;
  hasError: boolean;
  hasOperationInProgress: boolean;
  hasUnsavedChanges: boolean;
};

type ProjectSwitcherProps = {
  entries: ProjectSwitcherEntry[];
  activeId: string | null;
  /** False while a save/publish dialog is open for the active project — see
   * the "block switching" decision recorded in task 012. Switching and
   * closing are both disabled in that state (except closing is only ever
   * possible for the active project anyway, since only it can have an open
   * dialog). */
  canSwitch: boolean;
  isOpening: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onOpenAnother: () => void;
};

type IndicatorMeta = {
  Icon: typeof CircleAlert;
  label: string;
  tone: "error" | "operation" | "unsaved";
};

/** Returns every relevant state in action priority order. Clean active
 * projects deliberately get no indicator, keeping the list quiet without
 * hiding a second condition behind the first one. */
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

function ProjectSwitcherRows({
  entries,
  activeId,
  canSwitch,
  isOpening,
  onActivate,
  onClose,
  onOpenAnother,
}: ProjectSwitcherProps): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <ul className="project-switcher__list" role="list" aria-label={t.projectSwitcherAriaLabel}>
      {entries.map((entry) => {
        const isActive = entry.id === activeId;
        const accessibleName = entry.contextLabel
          ? `${entry.name} (${entry.contextLabel})`
          : entry.name;
        return (
          <li key={entry.id} className="project-switcher__item">
            <button
              type="button"
              className={`project-switcher__button${isActive ? " project-switcher__button--active" : ""}`}
              aria-current={isActive ? "true" : undefined}
              disabled={!canSwitch && !isActive}
              data-tooltip={!canSwitch && !isActive ? t.projectSwitcherSwitchBlockedHint : undefined}
              onClick={() => onActivate(entry.id)}
            >
              <span
                className="project-switcher__avatar"
                aria-hidden="true"
                style={{ backgroundColor: avatarColorVar(entry.id) }}
              >
                {avatarInitials(entry.name)}
              </span>
              <span className="project-switcher__copy">
                <span className="project-switcher__name">{entry.name}</span>
                {entry.contextLabel && (
                  <span className="project-switcher__context">{entry.contextLabel}</span>
                )}
              </span>
              <RowIndicators entry={entry} />
            </button>
            <button
              type="button"
              className="project-switcher__close"
              aria-label={t.projectSwitcherCloseLabel(accessibleName)}
              data-tooltip={canSwitch || !isActive ? t.projectSwitcherCloseLabel(accessibleName) : t.projectSwitcherSwitchBlockedHint}
              disabled={!canSwitch && isActive}
              onClick={() => onClose(entry.id)}
            >
              <X aria-hidden="true" />
            </button>
          </li>
        );
      })}
      <li className="project-switcher__item project-switcher__item--add">
        <button
          type="button"
          className="project-switcher__add"
          disabled={isOpening || !canSwitch}
          onClick={onOpenAnother}
        >
          <FolderPlus aria-hidden="true" />
          <span>{t.overviewOpenAnotherProject}</span>
        </button>
      </li>
    </ul>
  );
}

/** Expanded-sidebar rendering: the switcher sits between primary navigation
 * and Settings, as its own section. With no project open yet, it still
 * marks out that spot (rather than disappearing) with a quiet hint and the
 * same "open a project" action as the row list's own last entry. */
export function ProjectSwitcher(props: ProjectSwitcherProps): React.JSX.Element {
  const { t } = useLanguage();
  if (props.entries.length === 0) {
    return (
      <div className="project-switcher project-switcher--empty">
        <p>{t.projectSwitcherEmptyHint}</p>
        <button type="button" className="project-switcher__add" disabled={props.isOpening} onClick={props.onOpenAnother}>
          <FolderPlus aria-hidden="true" />
          <span>{t.overviewOpenProject}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="project-switcher">
      <ProjectSwitcherRows {...props} />
    </div>
  );
}

/**
 * Collapsed-sidebar rendering: one small square per open project (its
 * initial, plus a status badge when it needs attention), the same way the
 * primary nav collapses to icon-only buttons — no popover step needed since
 * there's room for every project at once. Closing a project isn't available
 * from here (there's no room for it next to a 36px icon); switch back to
 * the expanded sidebar, the command palette, or `Ctrl`/`Cmd+W`-style
 * shortcuts aren't wired up for it, so use the row list for that.
 */
export function ProjectSwitcherIcons({
  entries,
  activeId,
  canSwitch,
  isOpening,
  onActivate,
  onOpenAnother,
}: ProjectSwitcherProps): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <div className="project-switcher-icons">
      {entries.map((entry) => {
        const isActive = entry.id === activeId;
        const accessibleName = entry.contextLabel
          ? `${entry.name} (${entry.contextLabel})`
          : entry.name;
        const metas = indicatorMetas(entry, t);
        const primaryMeta = metas[0] ?? null;
        const statusSummary = metas.map((meta) => meta.label).join(" · ");
        return (
          <button
            key={entry.id}
            type="button"
            className={`project-switcher-icons__button${isActive ? " project-switcher-icons__button--active" : ""}`}
            aria-current={isActive ? "true" : undefined}
            disabled={!canSwitch && !isActive}
            aria-label={
              canSwitch || isActive
                ? statusSummary ? `${accessibleName} — ${statusSummary}` : accessibleName
                : t.projectSwitcherSwitchBlockedHint
            }
            data-tooltip={
              canSwitch || isActive
                ? statusSummary ? `${accessibleName} — ${statusSummary}` : accessibleName
                : t.projectSwitcherSwitchBlockedHint
            }
            onClick={() => onActivate(entry.id)}
          >
            <span
              className="project-switcher-icons__avatar"
              aria-hidden="true"
              style={{ backgroundColor: avatarColorVar(entry.id) }}
            >
              {avatarInitials(entry.name)}
            </span>
            {primaryMeta && (
              <span
                aria-label={statusSummary}
                className={`project-switcher-icons__badge project-switcher-icons__badge--${primaryMeta.tone}`}
              >
                <primaryMeta.Icon
                  aria-hidden="true"
                  className={primaryMeta.tone === "operation" ? "icon--spinning" : undefined}
                />
                {metas.length > 1 && (
                  <span className="project-switcher-icons__badge-count">+{metas.length - 1}</span>
                )}
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        className="project-switcher-icons__add"
        aria-label={entries.length > 0 ? t.overviewOpenAnotherProject : t.overviewOpenProject}
        data-tooltip={entries.length > 0 ? t.overviewOpenAnotherProject : t.overviewOpenProject}
        disabled={isOpening || !canSwitch}
        onClick={onOpenAnother}
      >
        <FolderPlus aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Narrow-layout rendering (sidebar hidden below ~800px): a single trigger
 * (showing the active project's initial) that opens the same row list in a
 * popover. Mirrors the button+ref+outside-click+Escape pattern already used
 * by `TitlebarMenu` in main.tsx. With no project open, there
 * is nothing to switch between yet, so it's a plain button that opens one
 * directly instead of a popover trigger.
 */
export function ProjectSwitcherCompact(props: ProjectSwitcherProps): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = "project-switcher-compact-popover";

  const closeAndRestoreFocus = (): void => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      closeAndRestoreFocus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (props.entries.length === 0) {
    return (
      <div className="project-switcher-compact">
        <button
          type="button"
          className="project-switcher-compact__trigger"
          aria-label={t.overviewOpenProject}
          data-tooltip={t.overviewOpenProject}
          disabled={props.isOpening}
          onClick={props.onOpenAnother}
        >
          <FolderPlus aria-hidden="true" />
        </button>
      </div>
    );
  }

  const activeEntry = props.entries.find((entry) => entry.id === props.activeId) ?? null;

  return (
    <div className="project-switcher-compact" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="project-switcher-compact__trigger"
        aria-label={t.projectSwitcherCollapsedTrigger}
        data-tooltip={t.projectSwitcherCollapsedTrigger}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        {activeEntry && (
          <span
            className="project-switcher-compact__avatar"
            aria-hidden="true"
            style={{ backgroundColor: avatarColorVar(activeEntry.id) }}
          >
            {avatarInitials(activeEntry.name)}
          </span>
        )}
      </button>
      {isOpen && (
        <div
          {...autoHideScrollbarProps<HTMLDivElement>()}
          id={popoverId}
          className="project-switcher-compact__popover auto-hide-scrollbar"
          role="dialog"
          aria-label={t.projectSwitcherAriaLabel}
        >
          <ProjectSwitcherRows
            {...props}
            onActivate={(id) => {
              closeAndRestoreFocus();
              props.onActivate(id);
            }}
            onClose={(id) => {
              closeAndRestoreFocus();
              props.onClose(id);
            }}
            onOpenAnother={() => {
              setIsOpen(false);
              props.onOpenAnother();
            }}
          />
        </div>
      )}
    </div>
  );
}
