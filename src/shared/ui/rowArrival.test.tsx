import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRowArrival } from "./rowArrival";

describe("useRowArrival", () => {
  it("does not animate the list a screen opens with", () => {
    const { result } = renderHook(({ keys }) => useRowArrival(keys, "project"), {
      initialProps: { keys: ["a", "b"] },
    });

    expect(result.current.size).toBe(0);
  });

  it("reports a key added after the first draw, in arrival order", () => {
    const { result, rerender } = renderHook(({ keys }) => useRowArrival(keys, "project"), {
      initialProps: { keys: ["a", "b"] },
    });

    rerender({ keys: ["a", "b", "c", "d"] });

    expect([...result.current.entries()]).toEqual([["c", 0], ["d", 1]]);
  });

  it("caps the cascade so a late arrival never waits on its list position", () => {
    const { result, rerender } = renderHook(({ keys }) => useRowArrival(keys, "project"), {
      initialProps: { keys: ["a"] },
    });

    rerender({ keys: ["a", "b", "c", "d", "e"] });

    expect([...result.current.values()]).toEqual([0, 1, 2, 3]);
  });

  it("treats a different list as a new first draw", () => {
    const { result, rerender } = renderHook(
      ({ keys, resetKey }) => useRowArrival(keys, resetKey),
      { initialProps: { keys: ["a"], resetKey: "project-1" } },
    );

    rerender({ keys: ["x", "y"], resetKey: "project-2" });

    expect(result.current.size).toBe(0);
  });

  it("animates a version saved at the head but not an older page", () => {
    const { result, rerender } = renderHook(
      ({ keys }) => useRowArrival(keys, "main", "prepended"),
      { initialProps: { keys: ["c3", "c2", "c1"] } },
    );
    expect(result.current.size).toBe(0);

    rerender({ keys: ["c4", "c3", "c2", "c1"] });
    expect([...result.current.keys()]).toEqual(["c4"]);

    // A page loaded below the row that was first is not new work.
    rerender({ keys: ["c4", "c3", "c2", "c1", "c0"] });
    expect(result.current.size).toBe(0);
  });
});
