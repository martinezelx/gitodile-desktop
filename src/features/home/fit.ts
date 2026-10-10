import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * How Home fits the window. The launcher is drawn for a work area of
 * `width` × `height` and scales with the area it is given — the smaller of
 * the two ratios, so it never spills below the window — between `min` and
 * `max`. One factor scales the whole block (type, icons, rows, radii and the
 * column's width), so its proportions never change. It never goes below 1: the
 * type scale's 10px floor holds, and a small window scrolls instead.
 */
export const HOME_SCALE = { width: 1240, height: 800, min: 1, max: 1.5 } as const;

/** Share of the free height above the launcher; the rest goes below, so the
 * block sits a little above the middle, where the eye expects it (2:3). The
 * same split is `grid-template-rows` in home.css. */
export const HOME_ABOVE = 0.4;

/** The scale for a work area, rounded to a hundredth so a resize that moves a
 * pixel does not draw the launcher again. 1 while the area is unknown. */
export function homeScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const fit = Math.min(width / HOME_SCALE.width, height / HOME_SCALE.height);
  return Math.round(Math.min(HOME_SCALE.max, Math.max(HOME_SCALE.min, fit)) * 100) / 100;
}

/** The space above the launcher, in pixels, for a work area `height` tall and
 * a resting launcher `restBody` tall at scale 1. Never negative: a launcher
 * taller than the area starts at its top and the screen scrolls. */
export function homeTop(height: number, restBody: number, scale: number): number {
  return Math.max(0, Math.round(HOME_ABOVE * (height - restBody * scale)));
}

type Area = { width: number; height: number };

/**
 * Scales Home to its work area and places it at the optical centre.
 *
 * At rest (an empty field on the Recent tab) the grid in home.css centres the
 * launcher by itself, and its resting height is noted. While the person types
 * or browses another tab the results grow and shrink, and a centred block
 * would move the greeting with every key, so the space above is held at what
 * the resting launcher had — recomputed only when the window itself changes.
 *
 * `frameRef` is the unscaled frame that fills the work area; `aboveRef` is the
 * empty first row, measured instead of the scaled launcher so no reading ever
 * depends on how a webview reports a zoomed box. A hidden screen has no size
 * and is left as it was.
 */
export function useHomeFit(resting: boolean): {
  frameRef: React.RefObject<HTMLDivElement | null>;
  aboveRef: React.RefObject<HTMLDivElement | null>;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  top: number | null;
} {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const aboveRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  // The resting launcher's height at scale 1, or null until it is measured.
  const [restBody, setRestBody] = useState<number | null>(null);
  const scale = area ? homeScale(area.width, area.height) : 1;

  // What the last committed render drew, for the observer's callback. Written
  // in a layout effect, not during render, and declared before the effect
  // that measures so it is current when that one runs.
  const state = useRef({ resting, scale });
  useLayoutEffect(() => {
    state.current = { resting, scale };
  }, [resting, scale]);

  const measure = useCallback((): void => {
    const frame = frameRef.current;
    if (!frame) return;
    const style = window.getComputedStyle(frame);
    const width = frame.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const height = frame.clientHeight;
    if (width <= 0 || height <= 0) return;
    setArea((current) =>
      current && Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { width, height },
    );
    const above = aboveRef.current;
    if (!state.current.resting || !above) return;
    const space = above.getBoundingClientRect().height;
    // No space above means the launcher fills the area or more; its exact
    // height is then unknown, and the area's is the closest true answer.
    const body = (space > 0.5 ? height - space / HOME_ABOVE : height) / state.current.scale;
    setRestBody((current) => (current !== null && Math.abs(current - body) < 0.5 ? current : body));
  }, []);

  // Rest, a new scale or a return from typing: read the layout just drawn.
  useLayoutEffect(measure, [measure, resting, scale]);

  // The window, or the resting launcher's own content (setup steps, a notice),
  // changed size.
  useEffect(() => {
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(() => measure());
    if (frameRef.current) observer.observe(frameRef.current);
    if (bodyRef.current) observer.observe(bodyRef.current);
    return () => observer.disconnect();
  }, [measure]);

  const top = !resting && area && restBody !== null ? homeTop(area.height, restBody, scale) : null;
  return { frameRef, aboveRef, bodyRef, scale, top };
}
