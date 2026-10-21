import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleMascot } from "./ConsoleMascot";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.reducedMotion; });

function animation(element: Element, type: string, name: string) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "animationName", { value: name });
  act(() => { element.dispatchEvent(event); });
}

describe("ConsoleMascot entrance", () => {
  it("finishes only its own entrance and starts again for a new drawing", () => {
    const { container, rerender } = render(<ConsoleMascot active />);
    const mascot = container.firstElementChild!;
    animation(mascot.querySelector(".console-art__row")!, "animationend", "console-art-reveal");
    animation(mascot, "animationend", "console-art-blink-closed");
    expect(mascot).toHaveClass("console-art--reveal");
    animation(mascot, "animationend", "console-art-settle");
    expect(mascot).not.toHaveClass("console-art--reveal");
    rerender(<ConsoleMascot active={false} />);
    rerender(<ConsoleMascot active />);
    expect(mascot).not.toHaveClass("console-art--reveal");
    rerender(<ConsoleMascot key="cleared" active />);
    expect(container.firstElementChild).toHaveClass("console-art--reveal");
  });

  it("retires an interrupted entrance when hidden", () => {
    const { container, rerender } = render(<ConsoleMascot active />);
    rerender(<ConsoleMascot active={false} />);
    rerender(<ConsoleMascot active />);
    expect(container.firstElementChild).not.toHaveClass("console-art--reveal");
  });

  it("does not replay an entrance cancelled by CSS", () => {
    const { container } = render(<ConsoleMascot active />);
    animation(container.firstElementChild!, "animationcancel", "console-art-settle");
    expect(container.firstElementChild).not.toHaveClass("console-art--reveal");
  });

  it("retires an entrance on an OS preference change even before CSS starts, and unsubscribes while hidden", () => {
    const motion = new EventTarget();
    Object.defineProperty(motion, "matches", { value: false, writable: true });
    const subscribe = vi.spyOn(motion, "addEventListener");
    const unsubscribe = vi.spyOn(motion, "removeEventListener");
    vi.stubGlobal("matchMedia", () => motion);
    const { container, rerender } = render(<ConsoleMascot active />);
    Object.defineProperty(motion, "matches", { value: true });
    act(() => { motion.dispatchEvent(new Event("change")); });
    expect(container.firstElementChild).not.toHaveClass("console-art--reveal");
    rerender(<ConsoleMascot active={false} />);
    expect(subscribe).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not queue an entrance while motion is reduced or the screen is hidden", () => {
    document.documentElement.dataset.reducedMotion = "true";
    const { container, rerender } = render(<ConsoleMascot active />);
    expect(container.firstElementChild).not.toHaveClass("console-art--reveal");
    delete document.documentElement.dataset.reducedMotion;
    rerender(<ConsoleMascot active />);
    expect(container.firstElementChild).not.toHaveClass("console-art--reveal");
    rerender(<ConsoleMascot key="hidden" active={false} />);
    rerender(<ConsoleMascot key="hidden" active />);
    expect(container.firstElementChild).not.toHaveClass("console-art--reveal");
  });
});
