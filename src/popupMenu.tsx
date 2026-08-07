import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";

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
