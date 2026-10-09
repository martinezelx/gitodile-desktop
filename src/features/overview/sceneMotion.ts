/**
 * The scene's motion: one short animation when its state changes, saying what
 * just happened — work leaving for the remote, work arriving from it, a new
 * version born by this computer, a check confirmed or lost. Nothing moves at
 * rest: the next-step card's glyph stays the page's one ambient animation.
 *
 * Pure DOM, given the scene's element after React has drawn the new state.
 * What has left the drawing (dots that travelled, a check or a badge that is
 * gone) is replayed with short-lived ghosts laid over it.
 */

/** The facts a transition is drawn from. */
export type SceneFacts = {
  outgoing: number;
  incoming: number;
  synced: boolean;
  unknown: boolean;
  hasRemote: boolean;
};

const TRAVEL_MS = 450;
const STAGGER_MS = 120;
const POP_MS = 220;
const MARK_OUT_MS = 180;
const DOTS_DRAWN = 3;

/** Whether the reader has asked for no animated movement, by the system or by
 * GitOdile's own switch. */
export function prefersReducedMotion(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.reducedMotion === "true") return true;
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function canAnimate(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && typeof element.animate === "function";
}

function pop(element: Element | null, base = "", delay = 0): void {
  if (!canAnimate(element)) return;
  const b = base ? `${base} ` : "";
  element.animate(
    [
      { transform: `${b}scale(0.4)`, opacity: 0 },
      { transform: `${b}scale(1.15)`, opacity: 1, offset: 0.7 },
      { transform: `${b}scale(1)`, opacity: 1 },
    ],
    { duration: POP_MS, delay, easing: "ease-out", fill: "backwards" },
  );
}

function bump(element: Element | null, delay = 0): void {
  if (!canAnimate(element)) return;
  element.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
    { duration: POP_MS, delay, easing: "ease-out" },
  );
}

/** A copy of something that has left the drawing, animated away and removed. */
function ghost(
  parent: Element | null,
  className: string,
  content: string,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): void {
  if (!(parent instanceof HTMLElement)) return;
  const element = document.createElement("span");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  element.innerHTML = content;
  element.style.pointerEvents = "none";
  parent.appendChild(element);
  if (typeof element.animate !== "function") {
    element.remove();
    return;
  }
  element.animate(frames, { fill: "forwards", ...options }).finished.then(
    () => element.remove(),
    () => element.remove(),
  );
}

// The check as drawn by the scene's icon, for its ghost once the real one is gone.
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function markOut(path: HTMLElement, className: string, content: string): void {
  ghost(
    path,
    className,
    content,
    [{ transform: "translateX(-50%) scale(1)", opacity: 1 }, { transform: "translateX(-50%) scale(0.4)", opacity: 0 }],
    { duration: MARK_OUT_MS, easing: "ease-in" },
  );
}

/** Dots that crossed the whole path and left the drawing: published or got. */
function travel(path: HTMLElement, count: number, kind: "out" | "in"): number {
  const width = path.getBoundingClientRect().width;
  const n = Math.min(count, DOTS_DRAWN);
  for (let index = 0; index < n; index += 1) {
    const order = kind === "out" ? n - 1 - index : index;
    const spacing = width / (n + 1);
    const start = kind === "out" ? spacing * (order + 1) : width - spacing * (n - order);
    const end = kind === "out" ? width + 18 : -18;
    ghost(
      path,
      `work-scene__dot work-scene__dot--${kind} work-scene__dot--ghost`,
      "",
      [
        { transform: `translateX(${start}px)`, opacity: 1 },
        { transform: `translateX(${start + (end - start) * 0.85}px)`, opacity: 1, offset: 0.8 },
        { transform: `translateX(${end}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: TRAVEL_MS, delay: index * STAGGER_MS, easing: "cubic-bezier(.4,0,.2,1)" },
    );
  }
  return n ? TRAVEL_MS + (n - 1) * STAGGER_MS : 0;
}

/** Dots that are new in the drawing: born by this computer, or sliding in
 * from the remote. */
function arrive(scene: HTMLElement, path: HTMLElement, count: number, kind: "out" | "in", delay: number): void {
  const dots = Array.from(scene.querySelectorAll(`.work-scene__dot--${kind}:not(.work-scene__dot--ghost)`));
  const fresh = dots.slice(-Math.min(count, dots.length));
  const pathBox = path.getBoundingClientRect();
  fresh.forEach((dot, index) => {
    if (!canAnimate(dot)) return;
    const box = dot.getBoundingClientRect();
    const from = kind === "out"
      ? `translateX(${pathBox.left - box.left}px) scale(0)`
      : `translateX(${pathBox.right - box.right + 14}px) scale(0.4)`;
    dot.animate(
      [{ transform: from, opacity: 0 }, { transform: "translateX(0) scale(1)", opacity: 1 }],
      { duration: 380, delay: delay + index * 110, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" },
    );
  });
}

function badgeChange(scene: HTMLElement, side: "out" | "in", before: number, after: number, delay: number): void {
  const place = scene.querySelector(side === "out" ? ".work-scene__place--here" : ".work-scene__place--remote");
  if (before === after) return;
  if (after > 0 && before === 0) pop(place?.querySelector(".work-scene__badge:not([aria-hidden])") ?? null, "", delay);
  else if (after > 0) bump(place?.querySelector(".work-scene__badge:not([aria-hidden])") ?? null, delay);
  else {
    ghost(
      place,
      `work-scene__badge work-scene__badge--${side}`,
      String(before),
      [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.4)", opacity: 0 }],
      { duration: 200, delay, easing: "ease-in" },
    );
  }
}

/**
 * Plays the change from `before` to `after` on `scene`, which already shows
 * `after`. Returns nothing: the animations run on their own and leave the
 * drawing exactly as React drew it.
 */
export function playSceneTransition(scene: HTMLElement, before: SceneFacts, after: SceneFacts): void {
  if (prefersReducedMotion()) return;
  const path = scene.querySelector<HTMLElement>(".work-scene__path");
  if (!path) return;

  // What left: versions that went to the remote, or came from it.
  let settled = 0;
  if (after.outgoing < before.outgoing && after.hasRemote && before.hasRemote) {
    settled = Math.max(settled, travel(path, before.outgoing - after.outgoing, "out"));
  }
  if (after.incoming < before.incoming) {
    settled = Math.max(settled, travel(path, before.incoming - after.incoming, "in"));
  }
  // A check or a "?" that is gone fades from where it stood.
  const markLeft = (before.synced && !after.synced) || (before.unknown && !after.unknown);
  if (before.synced && !after.synced) markOut(path, "work-scene__mark", CHECK_SVG);
  if (before.unknown && !after.unknown) markOut(path, "work-scene__mark work-scene__mark--unknown", "?");
  // A new mark takes the spot once the old one, or the travelling dots, have left it.
  const markDelay = settled || (markLeft ? MARK_OUT_MS : 0);
  // What arrived, once what left has gone.
  if (after.outgoing > before.outgoing && after.hasRemote) arrive(scene, path, after.outgoing - before.outgoing, "out", 180);
  if (after.incoming > before.incoming) arrive(scene, path, after.incoming - before.incoming, "in", 180);
  badgeChange(scene, "out", before.hasRemote ? before.outgoing : 0, after.hasRemote ? after.outgoing : 0, settled);
  badgeChange(scene, "in", before.incoming, after.incoming, settled);
  if (after.synced && !before.synced) pop(path.querySelector(".work-scene__mark:not(.work-scene__mark--unknown):not([aria-hidden])"), "translateX(-50%)", markDelay);
  if (after.unknown && !before.unknown) pop(path.querySelector(".work-scene__mark--unknown:not([aria-hidden])"), "translateX(-50%)", markDelay);
  // A remote has just been connected: its cloud fills in.
  if (after.hasRemote && !before.hasRemote) bump(scene.querySelector(".work-scene__place--remote"));
}

/** Whether two sets of facts would draw the same scene. */
export function sameSceneFacts(left: SceneFacts, right: SceneFacts): boolean {
  return left.outgoing === right.outgoing
    && left.incoming === right.incoming
    && left.synced === right.synced
    && left.unknown === right.unknown
    && left.hasRemote === right.hasRemote;
}
