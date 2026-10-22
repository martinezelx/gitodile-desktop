import { memo, useEffect, useRef, useState } from "react";
import { isReducedMotionRequested } from "../../shared/ui";
import { mascotEyes, mascotLines, mascotRain, type MascotRun } from "./mascotArt";

const LINES = mascotLines();
const RAIN = mascotRain();
const EYES = (["half", "closed"] as const).map((frame) => ({ frame, eyes: mascotEyes(frame) }));

function runClass(run: MascotRun): string | undefined {
  return [run.tone ? "console-art__tone1" : "", run.solid ? "console-art__solid" : ""].filter(Boolean).join(" ") || undefined;
}

/** CSS owns motion; an entrance belongs to a new drawing, not a screen revisit. */
export const ConsoleMascot = memo(function ConsoleMascot({ active, watermark = false }: { active: boolean; watermark?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [revealing, setRevealing] = useState(() => active && !isReducedMotionRequested());
  useEffect(() => {
    if (!active) {
      setRevealing(false);
      return;
    }
    const element = root.current;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    function reduceMotion() {
      if (motion?.matches) setRevealing(false);
    }
    function finishEntrance(event: AnimationEvent) {
      if (event.target === element && event.animationName === "console-art-settle") setRevealing(false);
    }
    // display:none and a changed motion preference cancel CSS animations.
    // Retire the entrance then too, so making the screen visible cannot replay it.
    element?.addEventListener("animationend", finishEntrance);
    element?.addEventListener("animationcancel", finishEntrance);
    // A preference can change before the browser starts the animation, when
    // there is no running animation to emit a cancellation event yet.
    motion?.addEventListener("change", reduceMotion);
    reduceMotion();
    return () => {
      element?.removeEventListener("animationend", finishEntrance);
      element?.removeEventListener("animationcancel", finishEntrance);
      motion?.removeEventListener("change", reduceMotion);
    };
  }, [active]);
  return (
    <div ref={root} className={`console-art${revealing ? " console-art--reveal" : ""}${watermark ? " console-art--watermark" : ""}`} aria-hidden="true" data-active={active}
      style={{ "--console-art-rows": LINES.length } as React.CSSProperties}>
      <div className="console-art__rain">
        {RAIN.map((drop) => <span key={drop.column} className="console-art__drop"
          style={{ "--column": drop.column, "--duration": `${watermark ? drop.duration * 2 : drop.duration}s`, "--delay": `${drop.delay}s` } as React.CSSProperties}>
          {drop.glyphs.slice(0, -1)}<b className="console-art__drop-head">{drop.glyphs.slice(-1)}</b>
        </span>)}
      </div>
      <pre className="console-art__mascot">
        {LINES.map((runs, row) => <span className="console-art__row" key={row} style={{ "--row": row } as React.CSSProperties}>
          {runs.map((run, index) => <span key={index} className={runClass(run)}>{run.text}</span>)}
        </span>)}
      </pre>
      <div className="console-art__eyes">
        {EYES.map(({ frame, eyes }) => <span key={frame} className={`console-art__eye-frame console-art__eye-frame--${frame}`}>
          {eyes.map((eye, index) => <span key={index} className="console-art__eye" style={{ left: `${index ? 35 : 30}ch` }}>{eye}</span>)}
        </span>)}
      </div>
    </div>
  );
});
