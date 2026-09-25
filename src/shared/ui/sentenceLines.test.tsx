import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SentenceLines } from "./sentenceLines";

function linesOf(text: string) {
  const { container } = render(<p><SentenceLines text={text} /></p>);
  const paragraph = container.querySelector("p")!;
  return {
    lines: [...paragraph.querySelectorAll(".sentence-line")].map((line) => line.textContent),
    text: paragraph.textContent,
  };
}

describe("SentenceLines", () => {
  it("keeps each sentence whole and still reads as one paragraph", () => {
    const { lines, text } = linesOf("Your name goes on every version. It's stored in Git.");

    expect(lines).toEqual(["Your name goes on every version.", "It's stored in Git."]);
    expect(text).toBe("Your name goes on every version. It's stored in Git.");
  });

  it("leaves a single sentence as plain text", () => {
    expect(linesOf("Choose whether the bar shows labels.").lines).toEqual([]);
  });

  it("keeps abbreviations and file names inside their sentence", () => {
    expect(linesOf("Used in e.g. src/app. See core.eol too.").lines).toEqual([
      "Used in e.g. src/app.",
      "See core.eol too.",
    ]);
    expect(linesOf("p. ej. feature/nueva. «Sistema» sigue tu idioma.").lines).toEqual([
      "p. ej. feature/nueva.",
      "«Sistema» sigue tu idioma.",
    ]);
  });
});
