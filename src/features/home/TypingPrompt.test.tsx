import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TypingPrompt } from "./TypingPrompt";

const QUESTION = "What's on today?";
const NEXT = "Where shall we start?";

function typed(container: HTMLElement): string {
  return container.querySelector("[aria-hidden]")?.firstChild?.textContent ?? "";
}

function plain(container: HTMLElement): string | undefined {
  return container.querySelector("p")?.innerHTML;
}

describe("TypingPrompt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete document.documentElement.dataset.reducedMotion;
  });

  it("types the question while the whole of it stays readable and laid out", () => {
    const { container } = render(<TypingPrompt text={QUESTION} startDelay={600} settled={false} className="prompt" />);
    expect(container.querySelector(".visually-hidden")?.textContent).toBe(QUESTION);
    expect(container.querySelector(".home-launcher__untyped")?.textContent).toBe(QUESTION);

    act(() => vi.advanceTimersByTime(700));
    expect(typed(container).length).toBeGreaterThan(0);
    expect(typed(container) + container.querySelector(".home-launcher__untyped")?.textContent).toBe(QUESTION);
  });

  it("ends as plain text once the caret has blinked and faded", () => {
    const { container } = render(<TypingPrompt text={QUESTION} startDelay={600} settled={false} className="prompt" />);
    act(() => vi.advanceTimersByTime(2_000));
    expect(container.querySelector(".home-launcher__caret--resting")).not.toBeNull();

    act(() => vi.advanceTimersByTime(2_000));
    expect(plain(container)).toBe(QUESTION);
  });

  it("types each new question, after the shorter wait it is given", () => {
    const { container, rerender } = render(
      <TypingPrompt text={QUESTION} startDelay={600} settled={false} className="prompt" />,
    );
    act(() => vi.advanceTimersByTime(5_000));
    expect(plain(container)).toBe(QUESTION);

    rerender(<TypingPrompt text={NEXT} startDelay={150} settled={false} className="prompt" />);
    expect(typed(container)).toBe("");
    act(() => vi.advanceTimersByTime(200));
    expect(typed(container).length).toBeGreaterThan(0);
  });

  it("shows the whole question once the reader starts typing in the field", () => {
    const { container, rerender } = render(
      <TypingPrompt text={QUESTION} startDelay={150} settled={false} className="prompt" />,
    );
    act(() => vi.advanceTimersByTime(250));
    rerender(<TypingPrompt text={QUESTION} startDelay={150} settled className="prompt" />);
    expect(plain(container)).toBe(QUESTION);

    rerender(<TypingPrompt text={QUESTION} startDelay={150} settled={false} className="prompt" />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(plain(container)).toBe(QUESTION);
  });

  it("shows the question at once under reduced motion", () => {
    document.documentElement.dataset.reducedMotion = "true";
    const { container } = render(<TypingPrompt text={QUESTION} startDelay={600} settled={false} className="prompt" />);
    expect(plain(container)).toBe(QUESTION);
  });
});
