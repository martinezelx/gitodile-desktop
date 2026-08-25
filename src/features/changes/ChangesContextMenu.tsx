import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { copyTextToClipboard } from "../../shared/ui";
import type { Translations } from "../../i18n";
import { handlePopupMenuKeyDown } from "../../shared/ui";

export type ChangesContextMenuState =
  | { kind: "copy"; x: number; y: number; text: string; focusTarget: HTMLElement | null }
  | { kind: "file"; x: number; y: number; path: string; focusTarget: HTMLElement | null };

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [copyError, setCopyError] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useLayoutEffect(() => {
    setCopyError(false);
    setIsCopying(false);
    if (!context || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(context.x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(context.y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [context]);

  useEffect(() => {
    if (!context) return undefined;
    const dismiss = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose(false);
    };
    const dismissForViewportChange = (): void => onClose(false);
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(true);
      }
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", dismissForViewportChange);
    document.addEventListener("scroll", dismissForViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", dismissForViewportChange);
      document.removeEventListener("scroll", dismissForViewportChange, true);
    };
  }, [context, onClose]);

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
    <div
      ref={menuRef}
      className="app-menu changes-context-menu"
      role="menu"
      aria-label={t.changesContextMenuLabel}
      style={{ left: context.x, top: context.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => handlePopupMenuKeyDown(event, menuRef.current, () => onClose(false))}
    >
      {context.kind === "copy" ? (
        <>
          <button className="app-menu__item" role="menuitem" type="button" disabled={context.text.length === 0 || isCopying} onClick={copy}>
            <Copy aria-hidden="true" />{t.changesCopy}
          </button>
          {copyError && <p className="changes-context-menu__error" role="alert">{t.changesCopyFailed}</p>}
        </>
      ) : (
        <button className="app-menu__item app-menu__item--danger" role="menuitem" type="button" onClick={() => onDiscard(context.path)}>
          <Trash2 aria-hidden="true" />{t.changesDiscardFileContext}
        </button>
      )}
    </div>
  );
}
