import { describe, expect, it, vi } from "vitest";
import { prepareRendererForInstall, registerInstallParticipant } from ".";

describe("renderer install preparation", () => {
  it("suspends and restores every registered background owner", () => {
    const firstResume = vi.fn();
    const secondResume = vi.fn();
    const firstSuspend = vi.fn(() => firstResume);
    const secondSuspend = vi.fn(() => secondResume);
    const unregisterFirst = registerInstallParticipant({ id: "first", label: "first", suspend: firstSuspend });
    const unregisterSecond = registerInstallParticipant({ id: "second", label: "second", suspend: secondSuspend });
    const result = prepareRendererForInstall();
    expect(result.kind).toBe("ready");
    expect(firstSuspend).toHaveBeenCalledOnce();
    expect(secondSuspend).toHaveBeenCalledOnce();
    if (result.kind === "ready") result.preparation.release();
    expect(firstResume).toHaveBeenCalledOnce();
    expect(secondResume).toHaveBeenCalledOnce();
    unregisterFirst();
    unregisterSecond();
  });

  it("rolls back earlier participants when preparation fails", () => {
    const resume = vi.fn();
    const unregisterFirst = registerInstallParticipant({ id: "rollback-first", label: "first", suspend: () => resume });
    const unregisterSecond = registerInstallParticipant({ id: "rollback-failure", label: "second", suspend: () => { throw new Error("no"); } });
    expect(prepareRendererForInstall()).toMatchObject({ kind: "blocked", label: "background work" });
    expect(resume).toHaveBeenCalledOnce();
    unregisterFirst();
    unregisterSecond();
  });
});
