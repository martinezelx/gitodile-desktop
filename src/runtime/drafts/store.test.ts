import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INSTALL_DRAFT_STORAGE_PREFIX,
  clearInstallDraft,
  prepareInstallDrafts,
  readInstallDraft,
  setInstallDraftBlocker,
  writeInstallDraft,
} from "./store";

const isMessage = (value: unknown): value is { title: string; description: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { title?: unknown }).title === "string" &&
  typeof (value as { description?: unknown }).description === "string";

describe("install draft registry", () => {
  beforeEach(() => {
    localStorage.clear();
    setInstallDraftBlocker("editor", "editor", false);
    clearInstallDraft("save-version:C:/repo");
  });

  it("restores a version message after its owner unmounts or the project changes", () => {
    const owner = "save-version:C:/project one";
    expect(writeInstallDraft(owner, "version message", { title: "Keep me", description: "Details" })).toBe(true);
    expect(readInstallDraft(owner, isMessage)).toEqual({ title: "Keep me", description: "Details" });
    expect(prepareInstallDrafts()).toEqual({ protected: [owner], blockers: [] });
  });

  it("returns an actionable blocker for a live editor that cannot be persisted", () => {
    setInstallDraftBlocker("editor", "project ignore rules", true);
    expect(prepareInstallDrafts().blockers).toEqual([
      { ownerId: "editor", label: "project ignore rules", reason: "requires-user-action" },
    ]);
  });

  it("blocks installation when synchronous persistence fails", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(writeInstallDraft("save-version:C:/repo", "version message", { title: "A", description: "" })).toBe(false);
    expect(prepareInstallDrafts().blockers[0]).toMatchObject({
      ownerId: "save-version:C:/repo",
      reason: "persistence-failed",
    });
    setItem.mockRestore();
  });

  it("rejects malformed retained envelopes and clears completed drafts", () => {
    localStorage.setItem(`${INSTALL_DRAFT_STORAGE_PREFIX}${encodeURIComponent("broken")}`, "{}");
    expect(prepareInstallDrafts().blockers[0]).toMatchObject({
      ownerId: "broken",
      reason: "stored-copy-invalid",
    });
    clearInstallDraft("broken");
    expect(prepareInstallDrafts()).toEqual({ protected: [], blockers: [] });
  });
});
