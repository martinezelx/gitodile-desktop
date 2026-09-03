import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipHost } from "./tooltip";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("TooltipHost", () => {
  async function showTooltip(): Promise<void> {
    fireEvent.mouseOver(screen.getByRole("button", { name: "Target" }));
    await act(async () => vi.advanceTimersByTime(151));
    expect(screen.getByText("Helpful detail")).toBeInTheDocument();
  }

  it("dismisses the tooltip before a pointer or keyboard action", async () => {
    render(
      <>
        <button type="button" data-tooltip="Helpful detail">Target</button>
        <TooltipHost />
      </>,
    );
    await showTooltip();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Helpful detail")).not.toBeInTheDocument();

    await showTooltip();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.queryByText("Helpful detail")).not.toBeInTheDocument();
  });

  it("dismisses a tooltip whose target leaves the document", async () => {
    const { rerender } = render(
      <>
        <button type="button" data-tooltip="Helpful detail">Target</button>
        <TooltipHost />
      </>,
    );
    await showTooltip();

    rerender(<TooltipHost />);
    await act(async () => Promise.resolve());

    expect(screen.queryByText("Helpful detail")).not.toBeInTheDocument();
  });

  it("centres a short tooltip on its control instead of reserving the maximum width", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(88);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(28);
    const targetRect = {
      bottom: 44,
      height: 32,
      left: 90,
      right: 130,
      top: 12,
      width: 40,
      x: 90,
      y: 12,
      toJSON: () => ({}),
    } satisfies DOMRect;
    render(
      <>
        <button type="button" data-tooltip="Show sidebar">Target</button>
        <TooltipHost />
      </>,
    );
    vi.spyOn(screen.getByRole("button", { name: "Target" }), "getBoundingClientRect")
      .mockReturnValue(targetRect);

    fireEvent.mouseOver(screen.getByRole("button", { name: "Target" }));
    await act(async () => vi.advanceTimersByTime(151));

    const tooltip = screen.getByText("Show sidebar");
    expect(tooltip).toHaveStyle({ left: "110px", top: "52px", visibility: "visible" });
    expect(tooltip).toHaveClass("app-tooltip--below");
  });

  it("clamps by the measured tooltip size and chooses the side with room", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(28);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(200);
    const targetRect = {
      bottom: 188,
      height: 32,
      left: 0,
      right: 20,
      top: 156,
      width: 20,
      x: 0,
      y: 156,
      toJSON: () => ({}),
    } satisfies DOMRect;
    render(
      <>
        <button type="button" data-tooltip="Edge action">Target</button>
        <TooltipHost />
      </>,
    );
    vi.spyOn(screen.getByRole("button", { name: "Target" }), "getBoundingClientRect")
      .mockReturnValue(targetRect);

    fireEvent.mouseOver(screen.getByRole("button", { name: "Target" }));
    await act(async () => vi.advanceTimersByTime(151));

    const tooltip = screen.getByText("Edge action");
    expect(tooltip).toHaveStyle({ left: "58px", top: "148px", visibility: "visible" });
    expect(tooltip).toHaveClass("app-tooltip--above");
  });

  /** `:focus-visible` itself is the browser's to decide, so these two stub the
   * one predicate and assert the branch: a click-driven focus is not a request
   * to read the label, a keyboard one is. */
  function stubFocusVisible(target: HTMLElement, value: boolean): void {
    const real = HTMLElement.prototype.matches;
    vi.spyOn(target, "matches").mockImplementation((selector: string) =>
      selector === ":focus-visible" ? value : real.call(target, selector),
    );
  }

  it("does not re-arm the tooltip when focus arrives from a click", async () => {
    render(
      <>
        <button type="button" data-tooltip="Helpful detail">Target</button>
        <TooltipHost />
      </>,
    );
    const target = screen.getByRole("button", { name: "Target" });
    stubFocusVisible(target, false);
    await showTooltip();

    // What a real click does: dismiss on `pointerdown`, then focus the control.
    fireEvent.pointerDown(target);
    fireEvent.focusIn(target);
    await act(async () => vi.advanceTimersByTime(151));

    expect(screen.queryByText("Helpful detail")).not.toBeInTheDocument();
  });

  it("still shows the tooltip when focus arrives from the keyboard", async () => {
    render(
      <>
        <button type="button" data-tooltip="Helpful detail">Target</button>
        <TooltipHost />
      </>,
    );
    const target = screen.getByRole("button", { name: "Target" });
    stubFocusVisible(target, true);

    fireEvent.focusIn(target);
    await act(async () => vi.advanceTimersByTime(151));

    expect(screen.getByText("Helpful detail")).toBeInTheDocument();
  });

  it("holds the direction class until the measurement lands", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(28);
    const seen: string[] = [];
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      // Read during the hidden measuring pass: whatever class the element
      // carries here is a class that would already have started an entry
      // animation, on a side nothing has measured yet.
      seen.push(this.className);
      return 88;
    });
    render(
      <>
        <button type="button" data-tooltip="Helpful detail">Target</button>
        <TooltipHost />
      </>,
    );
    fireEvent.mouseOver(screen.getByRole("button", { name: "Target" }));
    await act(async () => vi.advanceTimersByTime(151));

    expect(seen[0]).toBe("app-tooltip");
    // Which side it lands on is the placement tests' subject; this one only
    // asserts that exactly one side is named, and only after measuring.
    expect(screen.getByText("Helpful detail").className).toMatch(
      /^app-tooltip app-tooltip--(above|below)$/,
    );
  });

  it("survives the pointer crossing between children of one control", async () => {
    render(
      <>
        <button type="button" data-tooltip="Helpful detail">
          <svg><path d="M0 0" /><path d="M1 1" /></svg>
        </button>
        <TooltipHost />
      </>,
    );
    const target = screen.getByRole("button");
    const [first, second] = Array.from(target.querySelectorAll("path"));
    fireEvent.mouseOver(first);
    await act(async () => vi.advanceTimersByTime(151));
    expect(screen.getByText("Helpful detail")).toBeInTheDocument();

    // Both events bubble to the document listener even though the pointer never
    // left the button.
    fireEvent.mouseOut(first, { relatedTarget: second });
    fireEvent.mouseOver(second);

    expect(screen.getByText("Helpful detail")).toBeInTheDocument();
  });

  it("still dismisses when the pointer leaves the control itself", async () => {
    render(
      <>
        <button type="button" data-tooltip="Helpful detail">
          <svg><path d="M0 0" /></svg>
        </button>
        <span data-testid="elsewhere" />
        <TooltipHost />
      </>,
    );
    const target = screen.getByRole("button");
    fireEvent.mouseOver(target.querySelector("path")!);
    await act(async () => vi.advanceTimersByTime(151));
    expect(screen.getByText("Helpful detail")).toBeInTheDocument();

    fireEvent.mouseOut(target, { relatedTarget: screen.getByTestId("elsewhere") });

    expect(screen.queryByText("Helpful detail")).not.toBeInTheDocument();
  });

  it("does not carry one control's placement over to the next", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(28);
    const measured: string[] = [];
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      // The class the element carries at each measuring pass. A side named here
      // is a side nothing has measured yet, and an entry animation already
      // running on it.
      measured.push(this.className);
      return 88;
    });
    render(
      <>
        <button type="button" data-tooltip="Near the top">Top</button>
        <button type="button" data-tooltip="Near the bottom">Bottom</button>
        <TooltipHost />
      </>,
    );
    const top = screen.getByRole("button", { name: "Top" });
    const bottom = screen.getByRole("button", { name: "Bottom" });
    const rect = (y: number): DOMRect =>
      ({ bottom: y + 32, height: 32, left: 100, right: 140, top: y, width: 40, x: 100, y,
        toJSON: () => ({}) }) as DOMRect;
    // Hugging the top edge, so its tooltip goes below; and far enough down that
    // the other one goes above.
    vi.spyOn(top, "getBoundingClientRect").mockReturnValue(rect(4));
    vi.spyOn(bottom, "getBoundingClientRect").mockReturnValue(rect(600));

    fireEvent.mouseOver(top);
    await act(async () => vi.advanceTimersByTime(151));
    expect(screen.getByText("Near the top")).toHaveClass("app-tooltip--below");

    fireEvent.mouseOut(top, { relatedTarget: bottom });
    fireEvent.mouseOver(bottom);
    await act(async () => vi.advanceTimersByTime(151));

    expect(screen.getByText("Near the bottom")).toHaveClass("app-tooltip--above");
    // Every measuring pass, the second included, starts from no side at all.
    expect(measured).toEqual(["app-tooltip", "app-tooltip"]);
  });

});
