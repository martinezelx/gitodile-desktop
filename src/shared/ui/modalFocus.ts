import { useEffect, useRef } from "react";
import type React from "react";

/** Shared by every modal dialog (About, close confirmation, Save version) so
 * focus trapping and Escape-to-close behave identically everywhere. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
    // A roving tabindex takes its inactive items out of the tab order with
    // `tabindex="-1"`. The selector above still matches them by tag, so the
    // trap has to drop them too or Tab would walk a list the browser won't.
  ).filter((element) => !element.hasAttribute("hidden") && element.tabIndex >= 0);
}

export function useModalFocus<T extends HTMLElement>(
  isOpen: boolean,
  dialogRef: React.RefObject<T | null>,
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = (): void => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      // `data-autofocus` lets a dialog name its own landing point. Without it
      // focus goes to the first focusable element, which for any dialog with a
      // header close button is Close — so Enter right after opening shuts the
      // dialog the user just asked for.
      const preferred = dialog.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? getFocusableElements(dialog)[0] ?? dialog).focus();
    };
    const animationFrame = window.requestAnimationFrame(focusDialog);
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [dialogRef, isOpen, setIsOpen]);
}
