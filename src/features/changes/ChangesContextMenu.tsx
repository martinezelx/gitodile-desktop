import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { ContextMenuSurface, copyTextToClipboard, type ContextMenuAnchor } from "../../shared/ui";
import type { Translations } from "../../i18n";

/** The menu's mechanics — where it sits, how it is dismissed, what gets focus —
 * are `ContextMenuSurface` in `shared/ui`. What stays here is the only part
 * that was ever this feature's: which items a right-click on a diff line and on
 * a file row offers. */
export type ChangesContextMenuState =
  | (ContextMenuAnchor & { kind: "copy"; text: string })
  | (ContextMenuAnchor & { kind: "file"; path: string });

export function ChangesContextMenu({
  context,
  onClose,
  onCopied,
  onDiscard,
  t,
}: {
  context: ChangesContextMenuState | null;
  onClose: (restoreFocus: boolean) => void;
  onCopied: () => void;
  onDiscard: (path: string) => void;
  t: Translations;
}): React.JSX.Element | null {
  const [copyError, setCopyError] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    setCopyError(false);
    setIsCopying(false);
  }, [context]);

  if (!context) return null;

  const copy = (): void => {
    if (context.kind !== "copy" || context.text.length === 0 || isCopying) return;
    setIsCopying(true);
    void copyTextToClipboard(context.text)
      .then(() => {
        onCopied();
        onClose(true);
      })
      .catch(() => {
        setIsCopying(false);
        setCopyError(true);
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
        <>
          <button
            className="app-menu__item"
            role="menuitem"
            type="button"
            disabled={context.text.length === 0 || isCopying}
            onClick={copy}
          >
            <Copy aria-hidden="true" />
            {t.changesCopy}
          </button>
          {copyError && (
            <p className="changes-context-menu__error" role="alert">
              {t.changesCopyFailed}
            </p>
          )}
        </>
      ) : (
        <button
          className="app-menu__item app-menu__item--danger"
          role="menuitem"
          type="button"
          onClick={() => onDiscard(context.path)}
        >
          <Trash2 aria-hidden="true" />
          {t.changesDiscardFileContext}
        </button>
      )}
    </ContextMenuSurface>
  );
}
