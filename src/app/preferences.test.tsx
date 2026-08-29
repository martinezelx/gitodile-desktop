import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  REMOTE_CHECK_INTERVAL_STORAGE_KEY,
  useStoredRemoteCheckInterval,
} from "./preferences";

afterEach(() => localStorage.clear());

describe("useStoredRemoteCheckInterval", () => {
  it("defaults invalid or missing values to manual checks", () => {
    localStorage.setItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY, "5");
    const { result } = renderHook(() => useStoredRemoteCheckInterval());
    expect(result.current[0]).toBe(0);
  });

  it("reads and persists a supported cadence", () => {
    localStorage.setItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY, "15");
    const { result } = renderHook(() => useStoredRemoteCheckInterval());
    expect(result.current[0]).toBe(15);

    act(() => result.current[1](30));
    expect(localStorage.getItem(REMOTE_CHECK_INTERVAL_STORAGE_KEY)).toBe("30");
  });
});
