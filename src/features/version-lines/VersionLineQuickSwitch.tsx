import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitCompare,
  GitMerge,
  LoaderCircle,
  Search,
  Star,
  X,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { autoHideScrollbarProps, usePortalFlyout } from "../../shared/ui";
import type { VersionLine, VersionLinesSnapshot } from "./domain";
import { LineCreateFields, useLineCreateFlow, type VersionLineCreateContext } from "./VersionLineQuickCreateBox";

export type VersionLineQuickSwitchProps = {
  snapshot: VersionLinesSnapshot | null;
  isLoadingSnapshot: boolean;
  currentValue: string;
  /** The words in front of the value, so the strip states the context rather
   * than displaying a value whose meaning the reader has to infer. Purely
   * visual: the trigger's own accessible name already says what it changes. */
  contextLabel?: string;
  /** A caption *inside* the trigger, above the value, with the line glyph in a
   * neutral circle before both — the label-and-value shape of Overview's band
   * tiles, for a page header that has to say what the name is. Purely visual,
   * like `contextLabel`. */
  label?: string;
  canSwitch: boolean;
  variant?: "control" | "status";
  /** Whether the control variant draws its round "new line" button beside
   * the trigger. Off where the row has no room to spend on it; the menu's
   * footer carries the same action either way. */
  showCreateControl?: boolean;
  favouriteLines?: ReadonlySet<string>;
  onToggleFavourite?: (name: string) => void;
  onSwitch: (target: string) => void;
  /** Where a line created from this control is made. With it, "New line" and
   * a search that names no line open a create view inside the popup — the
   * Lines composer's fields and flow, in place of the list — rather than a
   * dialog. Without it, the control only chooses. */
  create?: VersionLineCreateContext;
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
  label,
  canSwitch,
  variant = "control",
  showCreateControl = true,
  favouriteLines = new Set<string>(),
  onToggleFavourite,
  onSwitch,
  create,
  onSeeAll,
}: VersionLineQuickSwitchProps): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  /** The line whose actions are showing inside the popup, if any. The actions
   * replace the list rather than opening a nested menu: the popup clips its own
   * overflow and dismisses on a press outside it, so a second floating surface
   * anchored to a row would be cut off or would close the control that opened
   * it. */
  const [actionLine, setActionLine] = useState<VersionLine | null>(null);
  /** The composer docked at the popup's foot in place of its footer, holding
   * the name it opened with. */
  const [creating, setCreating] = useState<{ initialName: string } | null>(null);
  // Read by the rows, which render in the branch where `actionLine` is `null`
  // and would therefore be narrowed away if they asked it directly.
  const openActionsName = actionLine?.name ?? null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
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
  /* A line can be started from here only where there is a commit for it to
     point at — not on an unborn `HEAD`, the case Lines hides its composer for. */
  const canCreate = create !== undefined && snapshot !== null && snapshot.headState !== "unborn";
  /* A search that names no line — the active one included, which the list
     leaves out — is offered as the name of a new one. */
  const typed = query.trim();
  const offersCreate =
    canCreate && typed !== "" && !snapshot.lines.some((line) => line.name === typed);
  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    setActionLine(null);
    setCreating(null);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const startCreate = (initialName: string): void => {
    setActionLine(null);
    setCreating({ initialName });
  };
  useEffect(() => {
    if (actionLine) backRef.current?.focus();
  }, [actionLine]);
  const { popupRef, style } = usePortalFlyout(
    isOpen,
    triggerRef,
    close,
    "below",
    "first-control",
  );
  const Chevron = variant === "status" ? ChevronUp : ChevronDown;
  const face = label ? (
    <>
      <span className="version-line-selector__tile" aria-hidden="true">
        <GitBranch className="version-line-selector__icon" />
      </span>
      <span className="version-line-selector__copy">
        <span className="version-line-selector__label" aria-hidden="true">{label}</span>
        <span className="version-line-selector__value">{currentValue}</span>
      </span>
    </>
  ) : (
    <>
      <GitBranch aria-hidden="true" className="version-line-selector__icon" />
      <span className="version-line-selector__value">{currentValue}</span>
    </>
  );

  const toggleOpen = (): void => {
    if (isOpen) {
      close(true);
      return;
    }
    setQuery("");
    setFavouritesOnly(false);
    setActionLine(null);
    setCreating(null);
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
          {face}
          <Chevron aria-hidden="true" className="version-line-selector__chevron" />
        </button>
      ) : (
        <span className="version-line-selector version-line-selector--static" title={currentValue}>
          {face}
        </span>
      )}

      {/* Only where the control has room for it. The status strip is 34px of
          chrome across the whole window, and its dropdown now carries the same
          action. */}
      {canCreate && variant === "control" && showCreateControl && (
        <button
          className="secondary-button version-lines-quick-switch__create"
          type="button"
          onClick={() => {
            setQuery("");
            setFavouritesOnly(false);
            startCreate("");
            setIsOpen(true);
          }}
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
          {actionLine ? (
            <div className="version-lines-quick-switch__actions">
              <div className="version-lines-quick-switch__actions-head">
                <button
                  ref={backRef}
                  type="button"
                  className="version-lines-quick-switch__back"
                  aria-label={t.versionLinesQuickSwitchBack}
                  onClick={() => setActionLine(null)}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <span className="version-lines-quick-switch__actions-name" title={actionLine.name}>{actionLine.name}</span>
              </div>
              {/* Stated, not offered: the actions name both ends so the
                  direction is never in doubt, and carry a `Soon` because the
                  flows behind them are not built yet. Disabled rather than
                  hidden, so the shape of what is coming is legible. */}
              <button className="app-menu__item" type="button" role="menuitem" disabled aria-disabled="true">
                <GitMerge aria-hidden="true" />
                <span className="version-lines-quick-switch__actions-label">{t.versionLinesMergeInto(currentValue)}</span>
                <span className="version-lines-quick-switch__soon">{t.versionLinesSoon}</span>
              </button>
              <button className="app-menu__item" type="button" role="menuitem" disabled aria-disabled="true">
                <GitCommitHorizontal aria-hidden="true" />
                <span className="version-lines-quick-switch__actions-label">{t.versionLinesRebaseOnto(currentValue)}</span>
                <span className="version-lines-quick-switch__soon">{t.versionLinesSoon}</span>
              </button>
              <button className="app-menu__item" type="button" role="menuitem" disabled aria-disabled="true">
                <GitCompare aria-hidden="true" />
                <span className="version-lines-quick-switch__actions-label">{t.versionLinesCompareWith(currentValue)}</span>
                <span className="version-lines-quick-switch__soon">{t.versionLinesSoon}</span>
              </button>
              <p className="version-lines-quick-switch__actions-note">{t.versionLinesActionsSoon}</p>
            </div>
          ) : (<>
          <div className="version-lines-quick-switch__search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t.versionLinesQuickSwitchSearchPlaceholder}
              aria-label={t.versionLinesQuickSwitchSearchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter on a name no line has is the create row's press.
                if (event.key === "Enter" && offersCreate && (visibleLines?.length ?? 0) === 0) {
                  event.preventDefault();
                  startCreate(typed);
                }
              }}
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
          ) : (visibleLines === null || visibleLines.length === 0) && !(offersCreate && !creating) ? (
            <p className="version-lines-quick-switch__empty">
              {favouritesOnly && !needle
                ? t.versionLinesQuickSwitchFavouritesEmpty
                : needle
                  ? t.versionLinesQuickSwitchSearchEmpty
                  : t.versionLinesQuickSwitchEmpty}
            </p>
          ) : (
            <ul className="version-lines-quick-switch__list" role="list">
              {(visibleLines ?? []).map((line) => {
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
                    {/* Always visible, unlike the favourite, and a chevron
                        rather than an ellipsis: it opens the line's actions in
                        place of the list, not a floating menu over it, and the
                        back control pairs with it. A control that only appears
                        under the pointer is one half the readers never find. */}
                    <button
                      type="button"
                      className="version-lines-quick-switch__more"
                      aria-label={t.versionLinesQuickSwitchActions(line.name)}
                      aria-haspopup="menu"
                      aria-expanded={openActionsName === line.name}
                      onClick={() => {
                        setQuery("");
                        setActionLine(line);
                      }}
                    >
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
              {/* The name typed is no line's, so it is offered as a new one —
                  last, under whatever the search did match, so choosing an
                  existing line stays the first thing in reach. It opens the
                  create view with the name in it rather than creating at
                  once: a search is a question, and Enter on it must not make
                  a line by accident. */}
              {offersCreate && !creating && (
                <li className="version-lines-quick-switch__item">
                  <button
                    type="button"
                    className="version-lines-quick-switch__choose version-lines-quick-switch__offer"
                    title={typed}
                    onClick={() => startCreate(typed)}
                  >
                    <span className="version-lines-quick-switch__glyph" aria-hidden="true">
                      <GitBranchPlus />
                    </span>
                    <span className="version-lines-quick-switch__copy">
                      <span className="version-lines-quick-switch__name">{t.versionLinesQuickSwitchCreateNamed(typed)}</span>
                      <span className="version-lines-quick-switch__context">{t.versionLinesQuickSwitchCreateHint}</span>
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
          </div>
          {/* The two things this control cannot answer by choosing from the
              list above it: a line that does not exist yet, and everything
              about a line that is not "which one am I on". The first is made
              right here, with the Lines composer's own flow; the second hands
              off to the Lines screen — there is no second one. */}
          {/* One row, not two: these are the two things choosing from the list
              above cannot answer, and a popup that spends two full rows on them
              is a popup with less room for the lines it exists to show. Ghost
              buttons rather than menu rows — they leave this control instead of
              choosing inside it. */}
          {/* A new line is named at the popup's foot, where "New line" was —
              the composer docked under the list the way it is under the Lines
              list. The popup keeps its size and its place: it was a view that
              replaced the list, which shrank the popup to the composer's
              height, and a popup measured and placed for the list then hung
              in the air — above the status bar, a gap opened between it and
              its trigger. */}
          {creating && create && snapshot ? (
            <QuickSwitchComposer
              key={creating.initialName}
              snapshot={snapshot}
              context={create}
              initialName={creating.initialName}
              onCancel={() => setCreating(null)}
              onCreated={() => close(false)}
            />
          ) : (
          <div className="version-lines-quick-switch__footer">
            {canCreate && (
              <button
                type="button"
                className="ghost-button version-lines-quick-switch__new"
                onClick={() => startCreate(offersCreate ? typed : "")}
              >
                <GitBranchPlus aria-hidden="true" />
                <span>{t.versionLinesQuickSwitchNew}</span>
              </button>
            )}
            <button
              type="button"
              className="ghost-button version-lines-quick-switch__see-all"
              onClick={() => {
                close(false);
                onSeeAll();
              }}
            >
              <span>{t.versionLinesQuickSwitchSeeAll}</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          )}
          </>)}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** A new line, made inside the popup: the Lines composer's fields and the
 * same `useLineCreateFlow`, docked at the popup's foot under the list — the
 * shape the composer has under the Lines list. Started with the name the
 * search held, if it named no line. Made, the popup closes — the control it
 * hangs from then names the line, which is the confirmation — and a failure
 * stays under the field to retry. Escape folds it back into the footer
 * without closing the popup. */
function QuickSwitchComposer({
  snapshot,
  context,
  initialName,
  onCancel,
  onCreated,
}: {
  snapshot: VersionLinesSnapshot;
  context: VersionLineCreateContext;
  initialName: string;
  onCancel: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const nameRef = useRef<HTMLInputElement>(null);
  const flow = useLineCreateFlow({
    ...context,
    forceSwitch: snapshot.headState === "detached",
    mainLine: snapshot.lines.find((line) => line.isDefault) ?? null,
    activeLine: snapshot.lines.find((line) => line.isActive) ?? null,
    existingNames: snapshot.lines.map((line) => line.name),
    draftKey: `quick-switch-version-line:${context.projectPath}`,
    initialName,
    onCreated: (next) => {
      context.onCreated(next);
      onCreated();
    },
  });
  // It opens to be typed in; a frame later than the popup's own
  // first-control focus when the popup opens straight into it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const field = nameRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="docked-composer docked-composer--expanded version-lines-quick-create version-lines-quick-switch__composer"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || flow.isBusy) return;
        // Folds the composer; the popup, which would otherwise close on the
        // same key, stays open on its list.
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="version-lines-quick-switch__composer-title">
        <GitBranchPlus aria-hidden="true" />
        <span>{t.versionLinesQuickSwitchNew}</span>
        <button
          type="button"
          className="version-lines-quick-switch__composer-close"
          aria-label={t.commonCancel}
          data-tooltip={t.commonCancel}
          disabled={flow.isBusy}
          onClick={onCancel}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <LineCreateFields flow={flow} nameRef={nameRef} expanded />
    </div>
  );
}
