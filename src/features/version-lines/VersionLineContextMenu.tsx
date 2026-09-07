import { useEffect, useState } from "react";
import { Copy, GitBranch, PenLine, Trash2 } from "lucide-react";

import { useLanguage } from "../../i18n";
import { ContextMenuSurface, copyTextToClipboard, type ContextMenuAnchor } from "../../shared/ui";
import type { VersionLine } from "./domain";
import { deleteActionLabel, versionLineActions } from "./lineActions";

/** A right-click on one row, and the line it landed on. The line is carried
 * rather than looked up again on each render: a refresh that reorders the list
 * must not silently repoint an open menu at a different line. */
export type VersionLineContextMenuState = ContextMenuAnchor & { line: VersionLine };

/** What a right-click on a version line offers. The same actions the detail
 * panel shows for the selected line, plus the one thing a pointer is for and a
 * panel is not: taking the name away as text.
 *
 * Availability and the Delete label come from `lineActions`, the one place
 * that decides them — the detail header reads the same functions. A menu that
 * offered a Delete the panel refuses, or called a blocked line safe, would be
 * two answers to one question. */
export function VersionLineContextMenu({
  context,
  onClose,
  onCopied,
  onSwitch,
  onRename,
  onDelete,
}: {
  context: VersionLineContextMenuState | null;
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
      {/* Short labels, and the line's name on the accessible one. The menu is
          already titled after the line it acts on, so repeating the name in
          every item only makes the menu as wide as the longest branch name in
          the project — and these are the same three words the detail header
          uses, which is what makes the two read as one set of actions. */}
      {canSwitch && (
        <button
          className="app-menu__item"
          role="menuitem"
          type="button"
          aria-label={t.versionLinesSwitchToLineLabel(line.name)}
          onClick={run(onSwitch)}
        >
          <GitBranch aria-hidden="true" />
          {t.versionLinesSwitchShort}
        </button>
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
      {canDelete && (
        <button
          className="app-menu__item app-menu__item--danger"
          role="menuitem"
          type="button"
          aria-label={deleteActionLabel(line, t)}
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
