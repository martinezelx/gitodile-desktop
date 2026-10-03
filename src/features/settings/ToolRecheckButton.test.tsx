import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolRecheckButton, TOOL_RECHECK_FEEDBACK_MS } from "./ToolRecheckButton";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.reducedMotion;
});

const props = {
  label: "Check again",
  busyLabel: "Checking…",
  busy: false,
  disabled: false,
};

describe("tool installation recheck", () => {
  it("keeps a fast check visible for one feedback turn and prevents duplicate clicks", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(<ToolRecheckButton {...props} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Check again" });
    expect(button).toHaveAttribute("data-tooltip", "Check again");
    expect(button.textContent).toBe("");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toHaveClass("icon--spinning");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(TOOL_RECHECK_FEEDBACK_MS - 1));
    expect(button).toBeDisabled();
    act(() => vi.advanceTimersByTime(1));
    expect(button).toBeEnabled();
    expect(button.querySelector("svg")).not.toHaveClass("icon--spinning");
    expect(button).toHaveAccessibleName("Check again");
  });

  it("stays disabled and spinning until a longer check settles", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const { rerender } = render(<ToolRecheckButton {...props} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    rerender(<ToolRecheckButton {...props} busy onClick={onClick} />);
    act(() => vi.advanceTimersByTime(TOOL_RECHECK_FEEDBACK_MS));
    const button = screen.getByRole("button", { name: "Checking…" });
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toHaveClass("icon--spinning");
    rerender(<ToolRecheckButton {...props} onClick={onClick} />);
    expect(button).toBeEnabled();
  });

  it.each(["app", "system"])("skips the cosmetic delay for %s reduced motion", (preference) => {
    vi.useFakeTimers();
    if (preference === "app") document.documentElement.dataset.reducedMotion = "true";
    else vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const onClick = vi.fn();
    render(<ToolRecheckButton {...props} onClick={onClick} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up feedback when the section is closed", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ToolRecheckButton {...props} onClick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("prevents rechecking while an installer is starting", () => {
    const onClick = vi.fn();
    render(<ToolRecheckButton {...props} disabled onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
