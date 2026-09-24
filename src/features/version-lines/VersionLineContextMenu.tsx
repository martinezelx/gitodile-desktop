import { useEffect, useState } from "react";
import { ArrowLeftRight, Copy, GitCommitHorizontal, GitCompare, GitMerge, PenLine, Trash2 } from "lucide-react";

import { useLanguage } from "../../i18n";
import { ContextMenuSurface, copyTextToClipboard, type ContextMenuAnchor } from "../../shared/ui";
import type { VersionLine } from "./domain";
import { deleteActionLabel, versionLineActions } from "./lineActions";

/** A right-click on one row, and the line it landed on. The line is carried
 * rather than looked up again on each render: a refresh that reorders the list
 * must not silently repoint an open menu at a different line. */
export type VersionLineContextMenuState = ContextMenuAnchor & { line: VersionLine };

/** What a right-click on a version line offers, grouped the way other Git
 * clients group a branch's menu: going to it; what it can do with the line
 * the project is on — merge, rebase, compare, stated but not yet offered;
 * renaming it and taking its name away as text; and, apart and last, the one
 * destructive action.
 *
 * Merge, rebase and compare are the quick switch's own three, in its words —
 * each names both ends so the direction is never inferred — disabled and
 * marked `Soon` until their flows exist, rather than hidden (DESIGN.md,
 * Honest affordances). They are offered only for a line that is not the
 * active one: the active line has nothing to merge into itself.
 *
 * Availability and the Delete label come from `lineActions`, the one place
 * that decides them — the detail header reads the same functions. A menu that
 * offered a Delete the panel refuses, or called a blocked line safe, would be
 * two answers to one question. */
export function VersionLineContextMenu({
  context,
  activeName,
  copiedIntoOf,
  onClose,
  onCopied,
  onSwitch,
  onRename,
  onDelete,
}: {
  context: VersionLineContextMenuState | null;
  /** The line the project is on, which merge, rebase and compare act with. */
  activeName: string | null;
  /** The main line's name when a line's work reached it as copies, if the
   * line's history has been read — for Delete's label. */
  copiedIntoOf?: (line: VersionLine) => string | null;
  onClose: (restoreFocus: boolean) => void;
  onCopied: () => void;
  onSwitch: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [copyError, setCopyError] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    setCopyError(false);
    setIsCopying(false);
  }, [context]);

  if (!context) return null;
  const { line } = context;
  const { canSwitch, canRename, canDelete } = versionLineActions(line);
  const soonActions =
    !line.isActive && activeName !== null
      ? [
          { key: "merge", icon: <GitMerge aria-hidden="true" />, label: t.versionLinesMergeInto(activeName) },
          {
            key: "rebase",
            icon: <GitCommitHorizontal aria-hidden="true" />,
            label: t.versionLinesRebaseOnto(activeName),
          },
          { key: "compare", icon: <GitCompare aria-hidden="true" />, label: t.versionLinesCompareWith(activeName) },
        ]
      : [];

  const copyName = (): void => {
    if (isCopying) return;
    setIsCopying(true);
    void copyTextToClipboard(line.name)
      .then(() => {
        onCopied();
        onClose(true);
      })
      .catch(() => {
        setIsCopying(false);
        setCopyError(true);
      });
  };

  // Runs an action and closes first: every one of these opens a dialog, and a
  // menu still standing behind it would take the outside click that dismisses
  // the dialog's backdrop.
  const run = (action: (name: string) => void) => (): void => {
    onClose(false);
    action(line.name);
  };

  return (
    <ContextMenuSurface
      anchor={context}
      ariaLabel={t.versionLinesContextMenuLabel(line.name)}
      className="version-lines-context-menu"
      onClose={onClose}
    >
      {/* Short labels, and the line's name on the accessible one. The menu is
          already titled after the line it acts on, so repeating the name in
          every item only makes the menu as wide as the longest branch name in
          the project — and these are the same words the detail header uses,
          with the same glyphs, which is what makes the two read as one set of
          actions. */}
      {canSwitch && (
        <button
          className="app-menu__item"
          role="menuitem"
          type="button"
          aria-label={t.versionLinesSwitchToLineLabel(line.name)}
          onClick={run(onSwitch)}
        >
          <ArrowLeftRight aria-hidden="true" />
          {t.versionLinesSwitchShort}
        </button>
      )}
      {soonActions.length > 0 && (
        <>
          {canSwitch && <div className="app-menu__divider" role="separator" />}
          {soonActions.map(({ key, icon, label }) => (
            <button
              key={key}
              className="app-menu__item"
              role="menuitem"
              type="button"
              disabled
              aria-disabled="true"
            >
              {icon}
              <span className="version-lines-quick-switch__actions-label">{label}</span>
              <span className="version-lines-quick-switch__soon">{t.versionLinesSoon}</span>
            </button>
          ))}
          <div className="app-menu__divider" role="separator" />
        </>
      )}
      {canRename && (
        <button
          className="app-menu__item"
          role="menuitem"
          type="button"
          aria-label={t.versionLinesRenameLineLabel(line.name)}
          onClick={run(onRename)}
        >
          <PenLine aria-hidden="true" />
          {t.versionLinesRenameShort}
        </button>
      )}
      <button
        className="app-menu__item"
        role="menuitem"
        type="button"
        disabled={isCopying}
        onClick={copyName}
      >
        <Copy aria-hidden="true" />
        {t.versionLinesCopyName}
      </button>
      {canDelete && <div className="app-menu__divider" role="separator" />}
      {canDelete && (
        <button
          className="app-menu__item app-menu__item--danger"
          role="menuitem"
          type="button"
          aria-label={deleteActionLabel(line, t, copiedIntoOf?.(line) ?? null)}
          onClick={run(onDelete)}
        >
          <Trash2 aria-hidden="true" />
          {t.versionLinesDeleteShort}
        </button>
      )}
      {copyError && (
        <p className="version-lines-context-menu__error" role="alert">
          {t.versionLinesCopyFailed}
        </p>
      )}
    </ContextMenuSurface>
  );
}
