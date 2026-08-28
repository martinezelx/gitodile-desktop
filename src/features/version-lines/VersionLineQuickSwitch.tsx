import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, GitBranch, GitBranchPlus, LoaderCircle } from "lucide-react";

import { useLanguage } from "../../i18n";
import { handlePopupMenuKeyDown, usePortalFlyout } from "../../shared/ui";
import type { VersionLine, VersionLinesSnapshot } from "./domain";

export type VersionLineQuickSwitchProps = {
  snapshot: VersionLinesSnapshot | null;
  isLoadingSnapshot: boolean;
  currentValue: string;
  canSwitch: boolean;
  variant?: "control" | "status";
  onSwitch: (target: string) => void;
  onCreate?: () => void;
  onSeeAll: () => void;
};

/**
 * Bounded shortcut to the shared version-line inventory. It deliberately
 * chooses a target but never performs the mutation: callers route that target
 * through the existing previewed switch flow.
 */
export function VersionLineQuickSwitch({
  snapshot,
  isLoadingSnapshot,
  currentValue,
  canSwitch,
  variant = "control",
  onSwitch,
  onCreate,
  onSeeAll,
}: VersionLineQuickSwitchProps): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lines: VersionLine[] | null = snapshot
    ? snapshot.lines
        .filter((line) => !line.isActive && line.name !== currentValue && !line.worktreePath)
        .slice(0, 6)
    : null;
  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { popupRef, style } = usePortalFlyout(isOpen, triggerRef, close, "below");
  const Chevron = variant === "status" ? ChevronUp : ChevronDown;

  return (
    <div className={`version-lines-quick-switch version-lines-quick-switch--${variant}`}>
      {canSwitch ? (
        <button
          ref={triggerRef}
          className="version-line-selector"
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t.versionLinesQuickSwitchChangeLabel(currentValue)}
          title={currentValue}
          onClick={() => setIsOpen((value) => !value)}
        >
          <GitBranch aria-hidden="true" className="version-line-selector__icon" />
          <span className="version-line-selector__value">{currentValue}</span>
          <Chevron aria-hidden="true" className="version-line-selector__chevron" />
        </button>
      ) : (
        <span className="version-line-selector version-line-selector--static" title={currentValue}>
          <GitBranch aria-hidden="true" className="version-line-selector__icon" />
          <span className="version-line-selector__value">{currentValue}</span>
        </span>
      )}

      {onCreate && (
        <button
          className="secondary-button version-lines-quick-switch__create"
          type="button"
          onClick={onCreate}
          aria-label={t.versionLinesQuickSwitchNew}
          data-tooltip={t.versionLinesQuickSwitchNew}
        >
          <GitBranchPlus aria-hidden="true" />
        </button>
      )}

      {isOpen && createPortal(
        <div
          ref={popupRef}
          className="app-menu version-lines-quick-switch__menu"
          role="menu"
          aria-label={t.versionLinesQuickSwitchTitle}
          style={style}
          onKeyDown={(event) =>
            handlePopupMenuKeyDown(event, popupRef.current, () => close(false))
          }
        >
          {lines === null && isLoadingSnapshot ? (
            <div className="version-lines-quick-switch__status" role="status">
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              <span className="visually-hidden">{t.versionLinesLoading}</span>
            </div>
          ) : lines === null || lines.length === 0 ? (
            <p className="version-lines-quick-switch__empty">{t.versionLinesQuickSwitchEmpty}</p>
          ) : (
            lines.map((line) => (
              <button
                key={line.name}
                type="button"
                role="menuitem"
                className="app-menu__item version-lines-quick-switch__item"
                title={line.name}
                onClick={() => {
                  close(false);
                  onSwitch(line.name);
                }}
              >
                {line.name}
              </button>
            ))
          )}
          <button
            type="button"
            role="menuitem"
            className="app-menu__item version-lines-quick-switch__see-all"
            onClick={() => {
              close(false);
              onSeeAll();
            }}
          >
            {t.versionLinesQuickSwitchSeeAll}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
