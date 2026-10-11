import type React from "react";

/**
 * The scroll area's "pointer is here" flag. It is a data attribute rather than
 * a class because React owns `class`: whenever a caller's `className` string
 * changes on a re-render, React rewrites the whole attribute and would wipe an
 * imperatively added class while the pointer is still inside. React never
 * touches an attribute it was not given, so this one survives re-renders.
 */
const POINTER_ACTIVE_ATTRIBUTE = "data-pointer-active";

/** Shows or hides an auto-hide scroll area's thumb without a React render. */
export function setAutoHideScrollbarActive(element: HTMLElement, active: boolean): void {
  if (active) element.setAttribute(POINTER_ACTIVE_ATTRIBUTE, "");
  else element.removeAttribute(POINTER_ACTIVE_ATTRIBUTE);
}

/**
 * WebView2 can leave `::-webkit-scrollbar-thumb:hover` visually stuck after
 * the pointer exits a scroll area. These shared handlers use real pointer
 * boundary events instead, without causing React renders or installing a
 * document-wide listener.
 */
export function autoHideScrollbarProps<T extends HTMLElement>(): Pick<
  React.HTMLAttributes<T>,
  "onPointerEnter" | "onPointerLeave" | "onPointerCancel"
> {
  return {
    onPointerEnter: (event) => {
      if (event.pointerType !== "touch") {
        setAutoHideScrollbarActive(event.currentTarget, true);
      }
    },
    onPointerLeave: (event) => {
      setAutoHideScrollbarActive(event.currentTarget, false);
    },
    onPointerCancel: (event) => {
      setAutoHideScrollbarActive(event.currentTarget, false);
    },
  };
}
