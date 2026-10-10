import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isReducedMotionRequested } from "../../shared/ui";

/** How long the caret keeps blinking after the last key, and its fade (the
 * transition on `.home-launcher__caret--fading` in home.css). */
const CARET_REST_MS = 1100;
const CARET_FADE_MS = 300;

/** A person's rhythm, kept brisk: an uneven beat per key, a little longer at
 * a space and a breath after a comma. About 1.5s for the longest question. */
function keyDelay(text: string, index: number): number {
  let delay = 22 + Math.random() * 30;
  if (text[index] === " ") delay += 15;
  if (",;".includes(text[index - 1] ?? "")) delay += 120;
  return delay;
}

type Phase = "typing" | "resting" | "fading";

interface Typing {
  text: string;
  count: number;
  phase: Phase;
}

interface TypingPromptProps {
  text: string;
  /** Wait before the first key, read when a new question starts typing. */
  startDelay: number;
  /** Shows the whole question at once, for a reader who has started typing
   * in the field beside it. */
  settled: boolean;
  className: string;
}

/** The Home question, typed each time it changes as if someone were writing
 * it. The untyped rest is already laid out, transparent, so the line wraps the
 * same at every key and nothing below it moves; a screen reader gets the
 * whole sentence at once. Under reduced motion it simply appears. */
export function TypingPrompt({ text, startDelay, settled, className }: TypingPromptProps): React.JSX.Element {
  const [typing, setTyping] = useState<Typing | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // A layout effect, so a new question never paints whole before it types.
  useLayoutEffect(() => {
    if (settled || isReducedMotionRequested()) {
      setTyping(null);
      return;
    }
    const step = (count: number, phase: Phase, delay: number, next: () => void): void => {
      setTyping({ text, count, phase });
      timer.current = window.setTimeout(next, delay);
    };
    const type = (count: number): void => {
      if (count < text.length) step(count, "typing", keyDelay(text, count), () => type(count + 1));
      else step(count, "resting", CARET_REST_MS, () => step(count, "fading", CARET_FADE_MS, () => setTyping(null)));
    };
    step(0, "typing", startDelay, () => type(1));
    return () => window.clearTimeout(timer.current);
    // Only a new question starts typing; `startDelay` and `settled` are read
    // as it starts, and a later `settled` is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    if (!settled) return;
    window.clearTimeout(timer.current);
    setTyping(null);
  }, [settled]);

  if (!typing || typing.text !== text) return <p className={className}>{text}</p>;

  return (
    <p className={className}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, typing.count)}
        <span className={`home-launcher__caret home-launcher__caret--${typing.phase}`} />
        <span className="home-launcher__untyped">{text.slice(typing.count)}</span>
      </span>
    </p>
  );
}
