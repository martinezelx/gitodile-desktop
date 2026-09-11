import { useEffect, useState } from "react";
import { Copy, FolderOpen, Trash2 } from "lucide-react";
import { ContextMenuSurface, copyTextToClipboard, type ContextMenuAnchor } from "../../shared/ui";
import type { Translations } from "../../i18n";
import type { ChangeCategory } from "../status";

/** The menu's mechanics — where it sits, how it is dismissed, what gets focus —
 * are `ContextMenuSurface` in `shared/ui`. What stays here is the only part
 * that was ever this feature's: which items a right-click on a diff line and on
 * a file row offers.
 *
 * `category` is carried because one of the file items depends on it: a deleted
 * file is not on the disk, so there is nothing for a file manager to show. */
export type ChangesContextMenuState =
  | (ContextMenuAnchor & { kind: "copy"; text: string })
  | (ContextMenuAnchor & { kind: "file"; path: string; category: ChangeCategory });

export function ChangesContextMenu({
  context,
  onClose,
  onCopied,
  onDiscard,
  onReveal,
  t,
}: {
  context: ChangesContextMenuState | null;
  onClose: (restoreFocus: boolean) => void;
  onCopied: () => void;
  onDiscard: (path: string) => void;
  /** Absent where the surface has no working tree behind it — History reads
   * saved versions, whose files are not the ones on the disk.
   *
   * Takes no promise back on purpose: this menu closes the moment it is
   * pressed, and the screen behind it owns whatever happens next. */
  onReveal?: (path: string) => void;
  t: Translations;
}): React.JSX.Element | null {
  const [failure, setFailure] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    setFailure(null);
    setIsCopying(false);
  }, [context]);

  if (!context) return null;

  /** Copying finishes inside this app in about a millisecond, so the menu waits
   * for it: it closes on success and stays open to say why on failure, which is
   * the only place that message could go.
   *
   * Revealing does not wait, and must not. Its whole result is another
   * application's window, and on Windows the shell call that opens it —
   * `SHOpenFolderAndSelectItems`, through `tauri-plugin-opener` — is
   * synchronous and can take a moment to answer while Explorer starts. Holding
   * the menu open and disabled across that read as a freeze; see the reveal
   * item below. */
  const copy = (text: string): void => {
    if (isCopying) return;
    setIsCopying(true);
    void copyTextToClipboard(text)
      .then(() => {
        onCopied();
        onClose(true);
      })
      .catch(() => {
        setIsCopying(false);
        setFailure(t.changesCopyFailed);
      });
  };

  return (
    <ContextMenuSurface
      anchor={context}
      ariaLabel={t.changesContextMenuLabel}
      className="changes-context-menu"
      onClose={onClose}
    >
      {context.kind === "copy" ? (
        <button
          className="app-menu__item"
          role="menuitem"
          type="button"
          disabled={context.text.length === 0 || isCopying}
          onClick={() => copy(context.text)}
        >
          <Copy aria-hidden="true" />
          {t.changesCopy}
        </button>
      ) : (
        <>
          <button
            className="app-menu__item"
            role="menuitem"
            type="button"
            disabled={isCopying}
            onClick={() => copy(context.path)}
          >
            <Copy aria-hidden="true" />
            {t.changesCopyPath}
          </button>
          {onReveal && (
            <button
              className="app-menu__item"
              role="menuitem"
              type="button"
              /* A deleted file has nothing to show. The row already says
                 "Deleted", so the reason is on screen and the item does not
                 owe a second explanation — it simply cannot be pressed. */
              disabled={context.category === "deleted"}
              /* Closes first, then asks. A menu that stayed open and greyed
                 while another application's window opened would be reporting
                 progress it cannot see the end of, and reads as a freeze.
                 Pressing the item is the whole interaction; the screen behind
                 it says so if the file manager never appears. */
              onClick={() => {
                onClose(true);
                onReveal(context.path);
              }}
            >
              <FolderOpen aria-hidden="true" />
              {t.changesRevealInFolder}
            </button>
          )}
          {/* A rule before the destructive item. The two above it are harmless
              and this one throws work away; a menu that puts them on one
              uninterrupted list invites the wrong click. */}
          <div className="changes-context-menu__divider" role="separator" />
          <button
            className="app-menu__item app-menu__item--danger"
            role="menuitem"
            type="button"
            onClick={() => onDiscard(context.path)}
          >
            <Trash2 aria-hidden="true" />
            {t.changesDiscardFileContext}
          </button>
        </>
      )}
      {failure && (
        <p className="changes-context-menu__error" role="alert">
          {failure}
        </p>
      )}
    </ContextMenuSurface>
  );
}
