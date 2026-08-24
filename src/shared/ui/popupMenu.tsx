import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";

type PopupFocusTarget = "selected-menu-item" | "first-control";

type PopupController = {
  containerRef: RefObject<HTMLDivElement | null>;
  popupRef: RefObject<HTMLDivElement | null>;
};

/** Shared focus and dismissal contract for the small anchored popups used by
 * the operational screens. Menus focus their selected item; form popups focus
 * their first control. Escape restores the trigger, while an outside click
 * simply dismisses the popup without stealing focus from the click target. */
export function useAnchoredPopup(
  isOpen: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  close: (restoreFocus: boolean) => void,
  focusTarget: PopupFocusTarget,
): PopupController {
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const target =
      focusTarget === "selected-menu-item"
        ? popupRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ??
          popupRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')
        : popupRef.current?.querySelector<HTMLElement>(
            "input:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex='-1'])",
          );
    target?.focus();
  }, [focusTarget, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeRef.current(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current(true);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, triggerRef]);

  return { containerRef, popupRef };
}

/**
 * Placement and dismissal for a popup whose trigger sits inside a panel that
 * clips its overflow — the sidebar rail, where an absolutely positioned menu
 * would be cut off at the panel edge. Callers portal the popup to `document.
 * body` and spread the returned `style`; this hook measures the anchor once
 * and hides the popup until that measurement lands, which is also why scroll
 * and resize dismiss it rather than letting it drift away from its trigger.
 *
 * `alignment` picks the flyout direction: "side" for the narrow rail, where a
 * menu as wide as the popup has nowhere to go but sideways, "below" for the
 * wider surfaces that can align it with the trigger's own left edge. Sideways
 * flyouts can opt into a shared vertical origin through the closest
 * `[data-flyout-group-anchor]`. This keeps sibling controls in a compact rail
 * from opening visually unrelated panels at opposite ends of the window.
 */
export function usePortalFlyout(
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  close: (restoreFocus: boolean) => void,
  alignment: "side" | "below",
  focusTarget: PopupFocusTarget = "selected-menu-item",
): { popupRef: RefObject<HTMLDivElement | null>; style: CSSProperties } {
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  // Runs before paint, so the popup is measured and placed in the same frame
  // it mounts — it renders hidden until `position` lands to keep that honest.
  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const popup = popupRef.current?.getBoundingClientRect();
    if (!trigger || !popup) {
      return;
    }
    const margin = 8;
    // A sideways flyout leaves from the edge of the panel it is escaping, not
    // from its trigger: rail buttons sit inside the sidebar's padding, so
    // measuring the button would open the popup a few pixels *over* the panel
    // it just escaped. A sibling group can also provide one shared vertical
    // origin so related rail panels do not jump between triggers.
    const side =
      triggerRef.current?.closest<HTMLElement>("[data-flyout-anchor]")?.getBoundingClientRect() ??
      trigger;
    const group =
      triggerRef.current?.closest<HTMLElement>("[data-flyout-group-anchor]")?.getBoundingClientRect() ??
      trigger;
    const preferredLeft = alignment === "side" ? side.right + 6 : trigger.left;
    const below = trigger.bottom + 6;
    setPosition({
      left: Math.max(margin, Math.min(preferredLeft, window.innerWidth - popup.width - margin)),
      top:
        alignment === "side"
          ? Math.max(margin, Math.min(group.top, window.innerHeight - popup.height - margin))
          : below + popup.height + margin <= window.innerHeight
            ? below
            : Math.max(margin, trigger.top - popup.height - 6),
    });
    const target =
      focusTarget === "selected-menu-item"
        ? popupRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
        : popupRef.current?.querySelector<HTMLElement>(
            "input:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex='-1'])",
          );
    target?.focus();
  }, [alignment, focusTarget, isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) {
        return;
      }
      closeRef.current(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      closeRef.current(true);
    };
    const dismiss = (): void => closeRef.current(false);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [isOpen, triggerRef]);

  return {
    popupRef,
    style: {
      position: "fixed",
      right: "auto",
      top: position?.top ?? 0,
      left: position?.left ?? 0,
      visibility: position ? "visible" : "hidden",
    },
  };
}

/** Implements the expected keyboard model for app-styled menus. Printable
 * keys perform a lightweight first-letter search, enough for these short,
 * translated option lists without introducing a hidden input. */
export function handlePopupMenuKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  menu: HTMLDivElement | null,
  close: () => void,
): void {
  const items = Array.from(
    menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]') ?? [],
  ).filter((item) => !item.disabled && item.getAttribute("aria-disabled") !== "true");
  if (items.length === 0) {
    return;
  }

  const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % items.length;
  } else if (event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + items.length) % items.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = items.length - 1;
  } else if (event.key === "Tab") {
    close();
    return;
  } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const query = event.key.toLocaleLowerCase();
    const ordered = [...items.slice(currentIndex + 1), ...items.slice(0, currentIndex + 1)];
    const match = ordered.find((item) => item.textContent?.trim().toLocaleLowerCase().startsWith(query));
    if (match) {
      event.preventDefault();
      match.focus();
    }
    return;
  } else {
    return;
  }

  event.preventDefault();
  items[nextIndex]?.focus();
}
