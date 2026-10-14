import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VERSION_LINE_FOLDS_STORAGE_KEY, useStoredLineFolds } from "./lineFolds";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useStoredLineFolds", () => {
  it("keeps each project's folds apart and across launches", async () => {
    localStorage.setItem(VERSION_LINE_FOLDS_STORAGE_KEY, JSON.stringify({ "/repo": { "bucket:clean-up": false } }));

    const { result, rerender } = renderHook(({ scope }: { scope: string }) => useStoredLineFolds(scope), {
      initialProps: { scope: "/repo" },
    });
    expect(result.current[0]).toEqual({ "bucket:clean-up": false });

    act(() => result.current[1]("cluster:in-progress:feature", true));
    rerender({ scope: "/other" });
    expect(result.current[0]).toEqual({});

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(VERSION_LINE_FOLDS_STORAGE_KEY) ?? "{}")).toEqual({
        "/repo": { "bucket:clean-up": false, "cluster:in-progress:feature": true },
      }),
    );
  });

  it("ignores what it cannot read", () => {
    localStorage.setItem(VERSION_LINE_FOLDS_STORAGE_KEY, JSON.stringify({ "/repo": { a: "yes", b: true }, x: [1] }));
    const { result } = renderHook(() => useStoredLineFolds("/repo"));
    expect(result.current[0]).toEqual({ b: true });
  });
});
