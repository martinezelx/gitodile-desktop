import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAutomaticRemoteCheck } from "./useAutomaticRemoteCheck";

afterEach(() => vi.useRealTimers());

describe("useAutomaticRemoteCheck", () => {
  it("checks only after the selected interval", () => {
    vi.useFakeTimers();
    const onCheck = vi.fn();
    renderHook(() => useAutomaticRemoteCheck({
      intervalMinutes: 15,
      projectId: "/repo",
      sessionEpoch: "epoch-1",
      eligible: true,
      onCheck,
    }));

    act(() => vi.advanceTimersByTime(15 * 60_000 - 1));
    expect(onCheck).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it("does not schedule network work when disabled or ineligible", () => {
    vi.useFakeTimers();
    const onCheck = vi.fn();
    renderHook(() => useAutomaticRemoteCheck({
      intervalMinutes: 0,
      projectId: "/repo",
      sessionEpoch: "epoch-1",
      eligible: true,
      onCheck,
    }));
    act(() => vi.runOnlyPendingTimers());
    expect(onCheck).not.toHaveBeenCalled();
  });

  it("restarts the cadence when the active project changes", () => {
    vi.useFakeTimers();
    const onCheck = vi.fn();
    const { rerender } = renderHook(
      ({ projectId }) => useAutomaticRemoteCheck({
        intervalMinutes: 15,
        projectId,
        sessionEpoch: "epoch-1",
        eligible: true,
        onCheck,
      }),
      { initialProps: { projectId: "/one" } },
    );
    act(() => vi.advanceTimersByTime(14 * 60_000));
    rerender({ projectId: "/two" });
    act(() => vi.advanceTimersByTime(60_000));
    expect(onCheck).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(14 * 60_000));
    expect(onCheck).toHaveBeenCalledOnce();
  });
});
