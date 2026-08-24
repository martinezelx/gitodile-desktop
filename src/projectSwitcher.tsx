import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  CircleAlert,
  CloudDownload,
  FileDiff,
  FolderInput,
  FolderPlus,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useLanguage } from "./i18n";
import { avatarColorVar, avatarInitials } from "./projectAvatar";
import { handlePopupMenuKeyDown, usePortalFlyout } from "./shared/ui";
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
 * (full-width row, round rail button, bordered compact square). */
const ADD_MENU_TRIGGER_CLASS = {
  row: "project-switcher__add",
  rail: "sidebar-round",
  compact: "project-switcher-compact__trigger",
} as const;

type AddProjectMenuVariant = keyof typeof ADD_MENU_TRIGGER_CLASS;

/**
 * The three ways to get a project — create, open, clone — behind one "+".
 * They used to sit side by side in every switcher surface, which cost three
 * rows of sidebar height (or three squares of the icon rail) to say one thing.
 *
 * The popup is fixed-positioned and portaled because `.sidebar` clips its
 * overflow: an absolutely positioned menu would be cut off at the panel edge,
 * and on the 88px rail it would have nowhere to open at all. `usePortalFlyout`
 * owns that escape — and the rule that comes with it: the anchor rect is
 * measured once, so scroll and resize dismiss the menu rather than letting it
 * drift off its trigger.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // The rail button is only 32px wide, so its menu flies out sideways; the
  // wider surfaces align it with the trigger's own left edge.
  const { popupRef, style } = usePortalFlyout(
    isOpen,
    triggerRef,
    close,
    variant === "rail" ? "side" : "below",
  );
  const attachMenu = (node: HTMLDivElement | null): void => {
    menuRef.current = node;
    popupRef.current = node;
  };

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
        data-tooltip={variant === "compact" ? t.projectSwitcherAddProject : undefined}
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
          ref={attachMenu}
          // Read by the compact switcher's own outside-click guard: this menu
          // lives in a portal, so without the marker its clicks would look
          // like a click outside the popover that renders its trigger.
          data-add-project-menu=""
          {...autoHideScrollbarProps<HTMLDivElement>()}
          className={`app-menu project-switcher-add-menu__popup${variant === "rail" ? " sidebar-project-flyout auto-hide-scrollbar" : ""}`}
          role="menu"
          aria-label={t.projectSwitcherAddProject}
          tabIndex={-1}
          style={style}
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
  // The rail's own popover leaves it out: its "+" sits right under the
  // trigger that opened the popover, so repeating it inside would be the same
  // control twice within 40px.
  withAddEntry = true,
}: ProjectSwitcherProps & { withAddEntry?: boolean }): React.JSX.Element {
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
      {withAddEntry && (
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
      )}
    </ul>
  );
}

/**
 * Sidebar rendering: the active project as one square at the foot of the
 * rail, with every other open project behind it in a searchable popover.
 *
 * The rail used to list every project at once, which cost it a row of height
 * per project and left long names truncated to a 68px column. One square
 * costs the same whether two projects are open or twenty, and the popover has
 * room to spell the names out — the active one is also written in full in the
 * screen's own heading.
 *
 * The popover is portaled for the same reason the add-project menu is:
 * `.sidebar` clips its overflow, so an absolutely positioned panel would be
 * cut off at the panel edge.
 */
export function ProjectSwitcherRail(props: ProjectSwitcherProps): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { entries, activeId, canSwitch } = props;

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { popupRef, style } = usePortalFlyout(isOpen, triggerRef, close, "side", "first-control");

  const activeEntry = entries.find((entry) => entry.id === activeId) ?? null;
  const needle = query.trim().toLocaleLowerCase();
  const matches = needle
    ? entries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle))
    : entries;
  const metas = activeEntry ? indicatorMetas(activeEntry, t) : [];
  const primaryMeta = metas[0] ?? null;
  const statusSummary = metas.map((meta) => meta.label).join(" · ");

  return (
    <div className="sidebar-project-group">
      {activeEntry && (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="sidebar-project"
            // The name stays out of the status summary: the badge below
            // announces that separately, and a trigger whose accessible name
            // changed with every background operation would be a moving
            // target for anyone navigating by voice.
            aria-label={t.projectSwitcherRailTrigger(activeEntry.name)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            disabled={!canSwitch}
            onClick={() => (isOpen ? close(true) : (setQuery(""), setIsOpen(true)))}
          >
            <span
              className="sidebar-project__avatar"
              aria-hidden="true"
              style={{ backgroundColor: avatarColorVar(activeEntry.id) }}
            >
              {avatarInitials(activeEntry.name)}
            </span>
            <span className="sidebar-project__chevron" aria-hidden="true">
              <ChevronDown />
            </span>
            {primaryMeta && (
              <span
                aria-label={statusSummary}
                className={`sidebar-project__badge sidebar-project__badge--${primaryMeta.tone}`}
              >
                <primaryMeta.Icon
                  aria-hidden="true"
                  className={primaryMeta.tone === "operation" ? "icon--spinning" : undefined}
                />
                {metas.length > 1 && (
                  <span className="sidebar-project__badge-count">+{metas.length - 1}</span>
                )}
              </span>
            )}
          </button>
          {isOpen && createPortal(
            <div
              ref={popupRef}
              {...autoHideScrollbarProps<HTMLDivElement>()}
              className="app-menu sidebar-project__popover sidebar-project-flyout auto-hide-scrollbar"
              role="dialog"
              aria-label={t.projectSwitcherAriaLabel}
              style={style}
            >
              <div className="sidebar-project__search">
                <Search aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  placeholder={t.projectSwitcherSearchPlaceholder}
                  aria-label={t.projectSwitcherSearchPlaceholder}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {matches.length > 0 ? (
                <ProjectSwitcherRows
                  {...props}
                  entries={matches}
                  withAddEntry={false}
                  onActivate={(id) => {
                    close(true);
                    props.onActivate(id);
                  }}
                  onClose={(id) => {
                    close(true);
                    props.onClose(id);
                  }}
                />
              ) : (
                <p className="sidebar-project__empty">{t.projectSwitcherSearchEmpty}</p>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
      <AddProjectMenu
        variant="rail"
        hasEntries={entries.length > 0}
        canSwitch={props.canSwitch}
        isOpening={props.isOpening}
        onOpenAnother={props.onOpenAnother}
        onCreate={props.onCreate}
        onClone={props.onClone}
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
