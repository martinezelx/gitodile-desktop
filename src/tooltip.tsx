import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Default tooltip for the whole app: put the text in `data-tooltip` on any
 * element (button, span, …) and this single delegated listener + portal
 * picks it up automatically — no per-element wiring needed. Portaling to
 * `document.body` with `position: fixed` means it's never clipped by a
 * scrolling ancestor (e.g. the sidebar) and always renders above everything
 * else, which the old per-element CSS `::after` tooltip couldn't guarantee. */

const SHOW_DELAY_MS = 150;
const VIEWPORT_MARGIN = 8;

interface TooltipState {
  text: string;
  rect: DOMRect;
}

/** A tooltip that only repeats text the element already shows in full is
 * noise — it fires on every hover and tells the reader nothing new. The
 * common case is truncated text (a long path with an ellipsis), where the
 * tooltip *is* the only way to read the rest, so it stays there: same text
 * is only redundant while the element isn't clipped. */
function isRedundant(target: HTMLElement, text: string): boolean {
  if (target.textContent?.trim() !== text.trim()) return false;
  const isClipped =
    target.scrollWidth > target.clientWidth + 1 || target.scrollHeight > target.clientHeight + 1;
  return !isClipped;
}

export function TooltipHost(): React.JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null);

  useEffect(() => {
    let showTimer: number | undefined;

    const clearShowTimer = () => {
      if (showTimer !== undefined) {
        window.clearTimeout(showTimer);
        showTimer = undefined;
      }
    };

    const onOver = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tooltip]");
      if (!target) return;
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      if (isRedundant(target, text)) return;
      clearShowTimer();
      showTimer = window.setTimeout(() => {
        setState({ text, rect: target.getBoundingClientRect() });
      }, SHOW_DELAY_MS);
    };

    const onOut = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tooltip]");
      if (!target) return;
      clearShowTimer();
      setState(null);
    };

    const onScrollOrResize = () => {
      clearShowTimer();
      setState(null);
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", onOut);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      clearShowTimer();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  if (!state) return null;

  const above = state.rect.top >= 48;
  const top = above ? state.rect.top - VIEWPORT_MARGIN : state.rect.bottom + VIEWPORT_MARGIN;
  const centerX = state.rect.left + state.rect.width / 2;
  const halfWidth = 160;
  const left = Math.min(
    Math.max(centerX, VIEWPORT_MARGIN + halfWidth),
    window.innerWidth - VIEWPORT_MARGIN - halfWidth,
  );

  return createPortal(
    <div
      className={`app-tooltip${above ? " app-tooltip--above" : " app-tooltip--below"}`}
      style={{ top, left }}
      role="presentation"
    >
      {state.text}
    </div>,
    document.body,
  );
}
