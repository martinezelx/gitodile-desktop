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
});
