import React from "react";

/* A sentence ends at . ! ? or …, and the next one starts with a capital, an
   opening question or exclamation mark, or an opening quote. Requiring the
   capital keeps "e.g. src" and "p. ej. feature" whole.

   No lookbehind: the macOS build targets Safari 13, whose engine rejects a
   lookbehind assertion when the module is parsed — esbuild cannot lower one —
   so one would take every screen importing the UI barrel down with it. The
   terminator is captured instead and put back before splitting. */
const SENTENCE_BREAK = /([.!?…])\s+(?=[\p{Lu}¿¡«“"(])/gu;
const SPLIT_MARK = "\u0000";

function splitSentences(text: string): string[] {
  return text.replace(SENTENCE_BREAK, `$1${SPLIT_MARK}`).split(SPLIT_MARK);
}

/**
 * Prose whose sentences break at their full stops.
 *
 * A description under a setting sits in a column beside its control, so two
 * sentences joined in one paragraph broke wherever the width ran out —
 * usually mid-phrase, leaving a ragged second line. Each sentence here is an
 * inline block: two that fit share one line, and when they do not, the second
 * moves down whole, so the break lands where the reader pauses anyway. Screen
 * readers still hear one paragraph: the sentences are spans, and the space
 * between them stays in the text.
 */
export function SentenceLines({ text }: { text: string }): React.JSX.Element {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return <>{text}</>;
  return (
    <>
      {sentences.map((sentence, index) => (
        // Sentences in one string never reorder, so the index is a stable key.
        <React.Fragment key={index}>
          {index > 0 ? " " : null}
          <span className="sentence-line">{sentence}</span>
        </React.Fragment>
      ))}
    </>
  );
}
