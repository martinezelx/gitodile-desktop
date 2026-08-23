import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CloudDownload, FileDiff, FolderInput, FolderPlus, LoaderCircle, Plus, X } from "lucide-react";
import { useLanguage } from "./i18n";
import { avatarColorVar, avatarInitials } from "./projectAvatar";
import { handlePopupMenuKeyDown } from "./shared/ui";
import { autoHideScrollbarProps } from "./shared/ui/autoHideScrollbar";

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
  onCreate: () => void;
  onClone: () => void;
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

/** Trigger class per surface. The menu itself is identical everywhere; only
 * the button wearing it changes shape, so each surface keeps its own look
 * (full-width row, dashed rail square, bordered compact square). */
const ADD_MENU_TRIGGER_CLASS = {
  row: "project-switcher__add",
  rail: "project-switcher-icons__add",
  compact: "project-switcher-compact__trigger",
} as const;

type AddProjectMenuVariant = keyof typeof ADD_MENU_TRIGGER_CLASS;

/**
 * The three ways to get a project — create, open, clone — behind one "+".
 * They used to sit side by side in every switcher surface, which cost three
 * rows of sidebar height (or three squares of the 76px rail) to say one thing.
 *
 * The popup is fixed-positioned and portaled because both `.sidebar` and
 * `.sidebar-scroll` clip their overflow: an absolutely positioned menu would
 * be cut off at the panel edge, and on the collapsed rail it would have
 * nowhere to open at all. That is the same escape `tooltip.tsx` makes, and it
 * brings the same rule with it — the anchor rect is measured once, so scroll
 * and resize dismiss the menu rather than letting it drift off its trigger.
 */
function AddProjectMenu({
  variant,
  hasEntries,
  canSwitch,
  isOpening,
  onOpenAnother,
  onCreate,
  onClone,
}: {
  variant: AddProjectMenuVariant;
  hasEntries: boolean;
  canSwitch: boolean;
  isOpening: boolean;
  onOpenAnother: () => void;
  onCreate: () => void;
  onClone: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // Runs before paint, so the menu is measured and placed in the same frame it
  // mounts — it is rendered hidden until `position` lands to keep that honest.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    if (!trigger || !menu) return;
    const margin = 8;
    // The rail is only 36px wide, so its menu flies out sideways; the wider
    // surfaces align it with the trigger's own left edge.
    const preferredLeft = variant === "rail" ? trigger.right + 6 : trigger.left;
    const below = trigger.bottom + 6;
    setPosition({
      left: Math.max(margin, Math.min(preferredLeft, window.innerWidth - menu.width - margin)),
      top: below + menu.height + margin <= window.innerHeight
        ? below
        : Math.max(margin, trigger.top - menu.height - 6),
    });
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [isOpen, variant]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    const dismiss = (): void => close(false);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [isOpen]);

  const choose = (action: () => void): void => {
    // Restore the trigger before running the action: every action opens a
    // dialog (or the OS folder picker), and the dialog's focus trap remembers
    // whatever is focused when it opens so it can hand focus back on close.
    // Without this, the chosen menu item unmounts and focus falls to <body>.
    close(true);
    action();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${ADD_MENU_TRIGGER_CLASS[variant]} project-switcher-add-menu__trigger`}
        aria-label={variant === "row" ? undefined : t.projectSwitcherAddProject}
        data-tooltip={variant === "row" ? undefined : t.projectSwitcherAddProject}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={!canSwitch}
        onClick={() => (isOpen ? close(true) : setIsOpen(true))}
      >
        <Plus aria-hidden="true" />
        {variant === "row" && <span>{t.projectSwitcherAddProject}</span>}
      </button>
      {isOpen && createPortal(
        <div
          ref={menuRef}
          // Read by the compact switcher's own outside-click guard: this menu
          // lives in a portal, so without the marker its clicks would look
          // like a click outside the popover that renders its trigger.
          data-add-project-menu=""
          className="app-menu project-switcher-add-menu__popup"
          role="menu"
          aria-label={t.projectSwitcherAddProject}
          tabIndex={-1}
          style={{
            position: "fixed",
            right: "auto",
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            visibility: position ? "visible" : "hidden",
          }}
          onKeyDown={(event) => handlePopupMenuKeyDown(event, menuRef.current, () => close(true))}
        >
          <button className="app-menu__item" role="menuitem" type="button" onClick={() => choose(onCreate)}>
            <FolderInput aria-hidden="true" />
            {t.projectSwitcherCreateProject}
          </button>
          <button
            className="app-menu__item"
            role="menuitem"
            type="button"
            disabled={isOpening}
            onClick={() => choose(onOpenAnother)}
          >
            <FolderPlus aria-hidden="true" />
            {hasEntries ? t.overviewOpenAnotherProject : t.overviewOpenProject}
          </button>
          <button className="app-menu__item" role="menuitem" type="button" onClick={() => choose(onClone)}>
            <CloudDownload aria-hidden="true" />
            {t.projectSwitcherCloneProject}
          </button>
        </div>,
        document.body,
      )}
    </>
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
  onCreate,
  onClone,
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
        <AddProjectMenu
          variant="row"
          hasEntries={entries.length > 0}
          canSwitch={canSwitch}
          isOpening={isOpening}
          onOpenAnother={onOpenAnother}
          onCreate={onCreate}
          onClone={onClone}
        />
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
        <AddProjectMenu
          variant="row"
          hasEntries={false}
          canSwitch={props.canSwitch}
          isOpening={props.isOpening}
          onOpenAnother={props.onOpenAnother}
          onCreate={props.onCreate}
          onClone={props.onClone}
        />
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
  onCreate,
  onClone,
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
      <AddProjectMenu
        variant="rail"
        hasEntries={entries.length > 0}
        canSwitch={canSwitch}
        isOpening={isOpening}
        onOpenAnother={onOpenAnother}
        onCreate={onCreate}
        onClone={onClone}
      />
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
      const target = event.target as HTMLElement;
      if (containerRef.current?.contains(target)) return;
      // The add-project menu opens from inside this popover but renders in a
      // portal, so its own clicks land outside the container. Without this
      // guard the popover would unmount on mousedown and the chosen action
      // would never fire.
      if (target.closest?.("[data-add-project-menu]")) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      // The add-project menu opens on top of this popover and listens on
      // `document` too, but it mounts later, so its handler runs second: one
      // Escape would close both layers. Let the innermost one answer first.
      if (document.querySelector("[data-add-project-menu]")) return;
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
        <AddProjectMenu
          variant="compact"
          hasEntries={false}
          canSwitch={props.canSwitch}
          isOpening={props.isOpening}
          onOpenAnother={props.onOpenAnother}
          onCreate={props.onCreate}
          onClone={props.onClone}
        />
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
            onClone={() => {
              setIsOpen(false);
              props.onClone();
            }}
            onCreate={() => {
              setIsOpen(false);
              props.onCreate();
            }}
          />
        </div>
      )}
    </div>
  );
}
