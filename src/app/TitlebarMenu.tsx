import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bug, CloudDownload, Ellipsis, FolderInput, FolderOpen, FolderX, Info, Keyboard, RotateCw, Settings, Sparkles } from "lucide-react";
import { useLanguage } from "../i18n";

export function TitlebarMenu({
  onOpenAbout,
  onOpenChangelog,
  onOpenProject,
  onCreateProject,
  onCloneProject,
  onCloseProject,
  onOpenSettings,
  onOpenShortcuts,
  hasProject,
  isOpeningProject,
  canReloadWindow,
  onReportIssue,
  isReportingIssue,
}: {
  onOpenAbout: () => void;
  onOpenChangelog: () => void;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloneProject: () => void;
  onCloseProject: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  hasProject: boolean;
  isOpeningProject: boolean;
  canReloadWindow: boolean;
  onReportIssue: () => void;
  isReportingIssue: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const focusOnOpenRef = useRef<"first" | "last">("first");

  const openMenu = (focus: "first" | "last" = "first"): void => {
    focusOnOpenRef.current = focus;
    setIsOpen(true);
  };
  const closeMenu = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const runMenuAction = (action: () => void): void => {
    closeMenu(true);
    action();
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!items?.length) return;
    items[focusOnOpenRef.current === "last" ? items.length - 1 : 0]?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeMenu(true);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    } else if (event.key === "Tab") {
      setIsOpen(false);
      return;
    } else return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div className="titlebar-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="titlebar-icon-button"
        type="button"
        aria-label={t.titlebarMoreActions}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closeMenu(true) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowUp" ? "last" : "first");
          }
        }}
      >
        <Ellipsis aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="titlebar-menu__list"
          role="menu"
          aria-label={t.titlebarMoreActions}
          onKeyDown={handleMenuKeyDown}
        >
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} disabled={isOpeningProject} onClick={() => runMenuAction(onOpenProject)}>
            <FolderOpen aria-hidden="true" />
            <span>{isOpeningProject ? t.overviewOpening : t.titlebarOpenProject}</span>
          </button>
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => runMenuAction(onCreateProject)}>
            <FolderInput aria-hidden="true" />
            <span>{t.titlebarCreateProject}</span>
          </button>
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => runMenuAction(onCloneProject)}>
            <CloudDownload aria-hidden="true" />
            <span>{t.titlebarCloneProject}</span>
          </button>
          {hasProject && (
            <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => runMenuAction(onCloseProject)}>
              <FolderX aria-hidden="true" />
              <span>{t.overviewCloseProject}</span>
            </button>
          )}
          <div className="titlebar-menu__divider" role="separator" />
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => runMenuAction(onOpenSettings)}>
            <Settings aria-hidden="true" />
            <span>{t.navSettings}</span>
          </button>
          <button
            className="titlebar-menu__item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={!canReloadWindow}
            aria-label={canReloadWindow ? t.titlebarReloadWindow : `${t.titlebarReloadWindow}. ${t.titlebarReloadBlocked}`}
            data-tooltip={canReloadWindow ? undefined : t.titlebarReloadBlocked}
            onClick={() => {
              if (canReloadWindow) runMenuAction(() => window.location.reload());
            }}
          >
            <RotateCw aria-hidden="true" />
            <span>{t.titlebarReloadWindow}</span>
          </button>
          <div className="titlebar-menu__divider" role="separator" />
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => runMenuAction(onOpenShortcuts)}>
            <Keyboard aria-hidden="true" />
            <span>{t.titlebarKeyboardShortcuts}</span>
          </button>
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1}
            aria-disabled={isReportingIssue} aria-describedby="issue-report-hint"
            onClick={() => { if (!isReportingIssue) runMenuAction(onReportIssue); }}>
            <Bug aria-hidden="true" />
            <span>{t.titlebarReportIssue}</span>
          </button>
          <span id="issue-report-hint" className="visually-hidden">{t.issueReportHint}</span>
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => runMenuAction(onOpenChangelog)}>
            <Sparkles aria-hidden="true" />
            <span>{t.changelogTitle}</span>
          </button>
          <button className="titlebar-menu__item" type="button" role="menuitem" tabIndex={-1} onClick={() => runMenuAction(onOpenAbout)}>
            <Info aria-hidden="true" />
            <span>{t.aboutGitOdile}</span>
          </button>
        </div>
      )}
    </div>
  );
}
