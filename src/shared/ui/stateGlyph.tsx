import React from "react";

/** The colour a state glyph speaks in. `accent` is for where the project
 * stands, `positive` and `warning` for a state that is good or needs a look,
 * and `neutral` for a fact worth flagging that is neither. */
export type StateGlyphTone = "neutral" | "positive" | "warning" | "accent";

/** One state a list row flags as a 14px glyph instead of a text chip. The
 * `tooltip` is the sentence that says what it means to someone who has not
 * learned the glyph yet; `count` is drawn beside the icon when the glyph
 * stands for a number of things. It is silent to assistive technology — the
 * row that draws it says the same states in its own accessible description. */
export function StateGlyph({ tone, icon, count, text, tooltip }: {
  tone: StateGlyphTone;
  icon: React.ReactNode;
  count?: string;
  /** A name the glyph cannot stand for on its own — a tag's — drawn beside
   * it and truncated before it can crowd the row. */
  text?: string;
  tooltip?: string;
}): React.JSX.Element {
  return (
    <span className={`state-glyph state-glyph--${tone}`} data-tooltip={tooltip} aria-hidden="true">
      <span className="state-glyph__icon">{icon}</span>
      {count && <span>{count}</span>}
      {text && <span className="state-glyph__text">{text}</span>}
    </span>
  );
}

/** A row's glyphs, in the order the row ranks them, at the gap every list
 * gives them. */
export function StateGlyphs({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="state-glyphs" aria-hidden="true">{children}</span>;
}
