import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  GitBranch,
  GitBranchPlus,
  LoaderCircle,
  Search,
  Star,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { autoHideScrollbarProps, usePortalFlyout } from "../../shared/ui";
import type { VersionLine, VersionLinesSnapshot } from "./domain";

export type VersionLineQuickSwitchProps = {
  snapshot: VersionLinesSnapshot | null;
  isLoadingSnapshot: boolean;
  currentValue: string;
  /** The words in front of the value, so the strip states the context rather
   * than displaying a value whose meaning the reader has to infer. Purely
   * visual: the trigger's own accessible name already says what it changes. */
  contextLabel?: string;
  canSwitch: boolean;
  variant?: "control" | "status";
  favouriteLines?: ReadonlySet<string>;
  onToggleFavourite?: (name: string) => void;
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
  contextLabel,
  canSwitch,
  variant = "control",
  favouriteLines = new Set<string>(),
  onToggleFavourite,
  onSwitch,
  onCreate,
  onSeeAll,
}: VersionLineQuickSwitchProps): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const eligibleLines: VersionLine[] | null = snapshot
    ? snapshot.lines.filter(
        (line) => !line.isActive && line.name !== currentValue && !line.worktreePath,
      )
    : null;
  const needle = query.trim().toLocaleLowerCase();
  const matches = eligibleLines
    ? eligibleLines
        .filter((line) => !favouritesOnly || favouriteLines.has(line.name))
        .filter((line) => !needle || line.name.toLocaleLowerCase().includes(needle))
        .sort(
          (left, right) =>
            Number(favouriteLines.has(right.name)) - Number(favouriteLines.has(left.name)),
        )
    : null;
  const visibleLines = matches?.slice(0, variant === "status" ? 6 : 9) ?? null;
  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { popupRef, style } = usePortalFlyout(
    isOpen,
    triggerRef,
    close,
    "below",
    "first-control",
  );
  const Chevron = variant === "status" ? ChevronUp : ChevronDown;

  const toggleOpen = (): void => {
    if (isOpen) {
      close(true);
      return;
    }
    setQuery("");
    setFavouritesOnly(false);
    setIsOpen(true);
  };

  return (
    <div className={`version-lines-quick-switch version-lines-quick-switch--${variant}`}>
      {contextLabel && (
        <span className="version-lines-quick-switch__context-label" aria-hidden="true">
          {contextLabel}
        </span>
      )}
      {canSwitch ? (
        <button
          ref={triggerRef}
          className="version-line-selector"
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t.versionLinesQuickSwitchChangeLabel(currentValue)}
          title={currentValue}
          onClick={toggleOpen}
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

      {/* Only where the control has room for it. The status strip is 34px of
          chrome across the whole window, and its dropdown now carries the same
          action. */}
      {onCreate && variant === "control" && (
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
          className={`app-menu version-lines-quick-switch__menu version-lines-quick-switch__menu--${variant}`}
          role="dialog"
          aria-label={t.versionLinesQuickSwitchTitle}
          style={style}
        >
          <div className="version-lines-quick-switch__search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t.versionLinesQuickSwitchSearchPlaceholder}
              aria-label={t.versionLinesQuickSwitchSearchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
            {onToggleFavourite && (
              <button
                type="button"
                className={`version-lines-quick-switch__filter${favouritesOnly ? " version-lines-quick-switch__filter--on" : ""}`}
                aria-pressed={favouritesOnly}
                aria-label={
                  favouritesOnly
                    ? t.versionLinesQuickSwitchFavouritesOnlyOff
                    : t.versionLinesQuickSwitchFavouritesOnly
                }
                onClick={() => setFavouritesOnly((value) => !value)}
              >
                <Star aria-hidden="true" />
              </button>
            )}
          </div>
          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            className="version-lines-quick-switch__results auto-hide-scrollbar"
          >
          {visibleLines === null && isLoadingSnapshot ? (
            <div className="version-lines-quick-switch__status" role="status">
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              <span className="visually-hidden">{t.versionLinesLoading}</span>
            </div>
          ) : visibleLines === null || visibleLines.length === 0 ? (
            <p className="version-lines-quick-switch__empty">
              {favouritesOnly && !needle
                ? t.versionLinesQuickSwitchFavouritesEmpty
                : needle
                  ? t.versionLinesQuickSwitchSearchEmpty
                  : t.versionLinesQuickSwitchEmpty}
            </p>
          ) : (
            <ul className="version-lines-quick-switch__list" role="list">
              {visibleLines.map((line) => {
                const isFavourite = favouriteLines.has(line.name);
                return (
                  <li key={line.name} className="version-lines-quick-switch__item">
                    <button
                      type="button"
                      className="version-lines-quick-switch__choose"
                      aria-label={line.name}
                      title={line.name}
                      onClick={() => {
                        close(false);
                        onSwitch(line.name);
                      }}
                    >
                      <span className="version-lines-quick-switch__glyph" aria-hidden="true">
                        <GitBranch />
                      </span>
                      <span className="version-lines-quick-switch__copy">
                        <span className="version-lines-quick-switch__name">{line.name}</span>
                        <span className="version-lines-quick-switch__context">{line.tip.subject}</span>
                      </span>
                    </button>
                    {onToggleFavourite && (
                      <button
                        type="button"
                        className={`version-lines-quick-switch__favourite${isFavourite ? " version-lines-quick-switch__favourite--on" : ""}`}
                        aria-pressed={isFavourite}
                        aria-label={
                          isFavourite
                            ? t.versionLinesQuickSwitchUnfavourite(line.name)
                            : t.versionLinesQuickSwitchFavourite(line.name)
                        }
                        data-tooltip={
                          isFavourite
                            ? t.versionLinesQuickSwitchUnfavouriteHint
                            : t.versionLinesQuickSwitchFavouriteHint
                        }
                        onClick={() => onToggleFavourite(line.name)}
                      >
                        <Star aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          </div>
          {/* The two things this control cannot answer by choosing from the
              list above it: a line that does not exist yet, and everything
              about a line that is not "which one am I on". Both hand off to the
              flow that owns them — there is no second way to create a line and
              no second Lines screen. */}
          <div className="version-lines-quick-switch__footer">
            {onCreate && (
              <button
                type="button"
                className="app-menu__item version-lines-quick-switch__new"
                onClick={() => {
                  close(false);
                  onCreate();
                }}
              >
                <GitBranchPlus aria-hidden="true" />
                <span>{t.versionLinesQuickSwitchNew}</span>
              </button>
            )}
            <button
              type="button"
              className="app-menu__item version-lines-quick-switch__see-all"
              onClick={() => {
                close(false);
                onSeeAll();
              }}
            >
              <span>{t.versionLinesQuickSwitchSeeAll}</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
