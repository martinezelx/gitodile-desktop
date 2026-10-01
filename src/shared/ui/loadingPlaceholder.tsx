import React from "react";

/**
 * The app's first-load state for anything whose shape is known before Git
 * answers: a list, a sentence, a form. The caller draws that shape with the
 * same classes as the real content, `TextPlaceholder` standing in for each
 * run of text, so the answer fills a space that was waiting for it instead of
 * pushing the layout about when it lands.
 *
 * Nothing shows for the first ~300ms (`.loading-placeholder` in
 * primitives.css). Most local Git reads answer inside that, and a placeholder
 * that flashes for a frame before the content reads as a flicker, not as
 * progress. Only a read that is actually slow gets to be seen waiting.
 *
 * Content whose shape can't be guessed — a diff, a screen still loading its
 * code — keeps `LoadingBar`. A refresh of something already on screen keeps
 * the content and says so with a spinning icon; it never swaps back to this.
 *
 * The placeholders are empty elements, so assistive tech hears only `label`.
 */
export function LoadingPlaceholder({
  label,
  className,
  children,
}: {
  /** What is being read, for assistive tech. Left out only for the second
   * half of a shape whose first half already says it, so one read isn't
   * announced twice. */
  label?: string;
  /** The layout class of the real content, so the shape sits where it will. */
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={className ? `loading-placeholder ${className}` : "loading-placeholder"}
      role={label === undefined ? undefined : "status"}
      aria-busy="true"
    >
      {label !== undefined && <span className="visually-hidden">{label}</span>}
      {children}
    </div>
  );
}

/** One run of text that hasn't been read yet. Takes the line height of the
 * text around it; `width` is the caller's guess at the line's length, never a
 * measure of the real answer. */
export function TextPlaceholder({
  width,
  className,
}: {
  width?: string | number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={className ? `text-placeholder ${className}` : "text-placeholder"}
      style={width === undefined ? undefined : { width }}
    />
  );
}
