import { useEffect, useRef } from "react";

export type DockedComposerFocusHandlers = {
  onFocus: () => void;
  onPointerDown: () => void;
  onBlur: (event: React.FocusEvent<HTMLElement>) => void;
};

/**
 * When a compose box docked under a list — Changes' save box, Lines' new-line
 * box — opens and folds. It opens on focus. It folds when focus leaves it and
 * folding would lose nothing (`canFold`: no draft, nothing in flight), and
 * never in a way the reader has to fight:
 *
 * - A press inside the box on something that takes no focus — a label's
 *   words, a disabled button, the padding — hands focus to the page, which is
 *   not leaving the box. Focus goes back where it was; a label's own click
 *   still toggles its control. Tracked with a pointer event, because a
 *   disabled button gets no `mousedown` at all.
 * - The window losing focus (minimized, another app, a native dialog) is not
 *   leaving the box either: the page keeps its focus on the field and hands
 *   it back on return, so folding now would only spring it open again then.
 * - A press somewhere else (a list row, a tab, another panel) waits for its
 *   click to land before the box folds. Folding between the press and its
 *   release moved the list under the pointer, so the release landed on
 *   another row or on none and the press was lost. That fold is un-anchored
 *   (`onFold(false)`), so the row just pressed stays where the reader is
 *   looking; a keyboard move away folds at once and anchored (`onFold(true)`).
 * - A request in flight disables the box's fields, and a disabled field drops
 *   its focus to the page. When the request ends, focus goes back to the
 *   field (`fieldRef`) — unless the reader has put it somewhere else since —
 *   so the box can still fold when they leave it, and a keyboard user is
 *   where they were.
 *
 * The box owns what folding means — resetting its own status, whether to take
 * a `useScrollAnchoredResize` snapshot — through `onFold`.
 */
export function useDockedComposerFocus({
  containerRef,
  fieldRef,
  expanded,
  busy,
  canFold,
  onOpen,
  onFold,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  /** The box's first field, where focus returns after a request. */
  fieldRef: React.RefObject<HTMLElement | null>;
  expanded: boolean;
  /** A request is in flight, so the box's fields are disabled. */
  busy: boolean;
  /** Whether folding now would lose nothing. Read through a ref, because a
   * fold deferred until a press ends runs after this render's values. */
  canFold: boolean;
  onOpen: () => void;
  /** `anchored` is false only for the fold that follows a press elsewhere. */
  onFold: (anchored: boolean) => void;
}): DockedComposerFocusHandlers {
  const canFoldRef = useRef(canFold);
  canFoldRef.current = canFold;
  const onFoldRef = useRef(onFold);
  onFoldRef.current = onFold;
  const pressedInsideRef = useRef(false);
  const pointerDownRef = useRef(false);

  // Whether a pointer is pressed anywhere in the window, so a blur can tell a
  // press elsewhere (whose click has not landed yet) from a keyboard move.
  // Only listened for while open, since only then can the box fold.
  useEffect(() => {
    if (!expanded) return;
    const down = (): void => {
      pointerDownRef.current = true;
    };
    const up = (): void => {
      pointerDownRef.current = false;
    };
    // A press whose release this window never sees — focus taken by another
    // app mid-press — would otherwise read as still held, and the next
    // keyboard move away would wait for a release that is not coming.
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
    return () => {
      pointerDownRef.current = false;
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", up);
    };
  }, [expanded]);

  const wasBusyRef = useRef(busy);
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (!wasBusy || busy) return;
    const active = document.activeElement;
    if (active === null || active === document.body) fieldRef.current?.focus();
  }, [busy, fieldRef]);

  return {
    onFocus: onOpen,
    onPointerDown: () => {
      // Marks a press as inside the box for the blur it causes, which runs in
      // this same task; cleared right after.
      pressedInsideRef.current = true;
      window.setTimeout(() => {
        pressedInsideRef.current = false;
      }, 0);
    },
    onBlur: (event) => {
      if (containerRef.current?.contains(event.relatedTarget as Node | null)) return;
      if (pressedInsideRef.current && event.relatedTarget === null) {
        const lostFocus = event.target as HTMLElement;
        window.setTimeout(() => lostFocus.focus(), 0);
        return;
      }
      if (!document.hasFocus()) return;
      if (!canFoldRef.current) return;
      if (!pointerDownRef.current) {
        onFoldRef.current(true);
        return;
      }
      const finish = (): void => {
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
        window.removeEventListener("blur", finish);
        window.setTimeout(() => {
          if (containerRef.current?.contains(document.activeElement)) return;
          if (canFoldRef.current) onFoldRef.current(false);
        }, 0);
      };
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", finish, true);
      window.addEventListener("blur", finish);
    },
  };
}
