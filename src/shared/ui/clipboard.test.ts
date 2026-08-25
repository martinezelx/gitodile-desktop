import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./clipboard";

afterEach(() => vi.restoreAllMocks());

describe("copyTextToClipboard", () => {
  it("copies exact selected text through the clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const text = "\tconst label = 'área ↔ منطقة';\n";

    await expect(copyTextToClipboard(text, { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(text);
  });

  it("does not write an empty selection", async () => {
    const writeText = vi.fn();
    await expect(copyTextToClipboard("", { writeText })).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the document copy command", async () => {
    const command = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: command });
    await expect(copyTextToClipboard("fallback", undefined)).resolves.toBe(true);
    expect(command).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
    Reflect.deleteProperty(document, "execCommand");
  });
});
