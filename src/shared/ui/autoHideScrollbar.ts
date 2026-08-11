import type React from "react";

const POINTER_ACTIVE_CLASS = "auto-hide-scrollbar--pointer-active";

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
        event.currentTarget.classList.add(POINTER_ACTIVE_CLASS);
      }
    },
    onPointerLeave: (event) => {
      event.currentTarget.classList.remove(POINTER_ACTIVE_CLASS);
    },
    onPointerCancel: (event) => {
      event.currentTarget.classList.remove(POINTER_ACTIVE_CLASS);
    },
  };
}
