import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  FAVOURITE_VERSION_LINES_STORAGE_KEY,
  useStoredFavouriteVersionLines,
} from "./favourites";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useStoredFavouriteVersionLines", () => {
  it("persists choices by common Git directory and keeps project scopes separate", async () => {
    localStorage.setItem(
      FAVOURITE_VERSION_LINES_STORAGE_KEY,
      JSON.stringify({ "C:\\repo\\.git": ["main"] }),
    );

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string | null }) => useStoredFavouriteVersionLines(scope),
      { initialProps: { scope: "C:\\repo\\.git" } },
    );

    expect(result.current[0]).toEqual(new Set(["main"]));
    act(() => result.current[1]("feature/search"));
    expect(result.current[0]).toEqual(new Set(["main", "feature/search"]));

    rerender({ scope: "C:\\other\\.git" });
    expect(result.current[0]).toEqual(new Set());
    act(() => result.current[1]("release"));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(FAVOURITE_VERSION_LINES_STORAGE_KEY) ?? "{}"))
        .toEqual({
          "C:\\repo\\.git": ["main", "feature/search"],
          "C:\\other\\.git": ["release"],
        });
    });
  });
});
