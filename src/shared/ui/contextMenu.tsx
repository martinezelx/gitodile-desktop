import { useEffect, useLayoutEffect, useRef } from "react";

import { handlePopupMenuKeyDown } from "./popupMenu";

/** Where a right-click happened, and what had focus when it did.
 *
 * The focus target is carried rather than read back from `document` on close:
 * by then the menu itself holds focus, and the element to restore to is the row
 * or the field the pointer was over. A feature adds whatever else its own items
 * need alongside these three. */
export type ContextMenuAnchor = { x: number; y: number; focusTarget: HTMLElement | null };

/** The surface a right-click menu is drawn on: an `.app-menu` pinned to the
 * pointer, clamped inside the viewport, dismissed by an outside click, Escape,
 * a scroll or a resize, and opened with its first usable item focused.
 *
 * ADR 0003's two-consumer bar, passed twice over: the Changes file list and its
 * diff had this written once between them, History borrowed the whole component
 * to get it, and the version-lines list needed the same behaviour with entirely
 * different items. What is shared is the *mechanics*; the items never were, so
 * they stay with the feature that owns them and arrive as children.
 *
 * A scroll dismisses rather than follows: the menu is pinned to a viewport
 * point, and a list that moves under it would leave it pointing at a different
 * row than the one it describes. */
export function ContextMenuSurface({
  anchor,
  ariaLabel,
  className,
  onClose,
  children,
}: {
  /** `null` closes the menu — the host keeps the open/closed state so the
   * anchor and whatever the items act on stay one value. */
  anchor: ContextMenuAnchor | null;
  ariaLabel: string;
  className?: string;
  /** `true` asks for focus to go back where it came from. Passed on a
   * deliberate dismissal (Escape, an item that ran) and not on an outside
   * click, which has already put focus somewhere the user chose. */
  onClose: (restoreFocus: boolean) => void;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const menu = menuRef.current;
    // Parked at the safe origin *before* measuring. Measuring it where the
    // pointer left it is measuring it squeezed: a menu rendered 4px from the
    // right edge has 4px to lay its labels out in, wraps them, and reports a
    // narrower box than it will occupy once it has been moved back inside — so
    // the clamp used a width that was too small and the menu still overhung the
    // edge by those few pixels. With the full viewport to lay out in, what is
    // measured is what will be drawn.
    menu.style.left = "8px";
    menu.style.top = "8px";
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return undefined;
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
  }, [anchor, onClose]);

  if (!anchor) return null;

  return (
    <div
      ref={menuRef}
      className={className ? `app-menu context-menu ${className}` : "app-menu context-menu"}
      role="menu"
      aria-label={ariaLabel}
      style={{ left: anchor.x, top: anchor.y }}
      // A second right-click inside the menu is the platform's own menu asking
      // to open on top of this one.
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => handlePopupMenuKeyDown(event, menuRef.current, () => onClose(false))}
    >
      {children}
    </div>
  );
}

/** Turns a right-click into an anchor, for a host that keeps the menu state.
 * Nothing but arithmetic and the focus target — kept here so the two callers
 * cannot disagree about which of `clientX` and `pageX` a fixed surface wants. */
export function contextMenuAnchorFrom(event: React.MouseEvent): ContextMenuAnchor {
  return {
    x: event.clientX,
    y: event.clientY,
    focusTarget: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  };
}
