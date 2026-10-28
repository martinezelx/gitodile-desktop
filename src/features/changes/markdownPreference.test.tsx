import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKDOWN_VIEW_STORAGE_KEY, useMarkdownView } from "./markdownPreference";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.removeItem(MARKDOWN_VIEW_STORAGE_KEY); });

describe("Markdown reading preference", () => {
  it.each([null, "unknown", "markdown"])("defaults to preview for %s", (value) => {
    if (value !== null) localStorage.setItem(MARKDOWN_VIEW_STORAGE_KEY, value);
    expect(renderHook(useMarkdownView).result.current[0]).toBe("markdown");
  });
  it.each(["unified", "split", "accessible"])("restores %s", (value) => {
    localStorage.setItem(MARKDOWN_VIEW_STORAGE_KEY, value);
    expect(renderHook(useMarkdownView).result.current[0]).toBe(value);
  });
  it("still changes the session view when local storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
    const { result } = renderHook(useMarkdownView);
    expect(result.current[0]).toBe("markdown");
    act(() => result.current[1]("split"));
    expect(result.current[0]).toBe("split");
  });
});
